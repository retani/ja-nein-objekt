///////// CONFIG

//var master_network_address = "192.168.5.1"
var master_network_address = "192.168.0.2"
//var master_network_address = "192.168.178.25"
//var master_network_address = "192.168.178.134"

var amp_factor = 2;// 1.5

var sendDDP = true

var initialBorders = [
  {
    type: "inner",
    value: 12
  },
  {
    type: "outer",
    value: 50 //80
  },
  {
    type: "touch",
    value: 5
  },
  {
    type: "reset",
    value: 1000
  },  
]

///////// BORDER MANAGEMENT

var borders = JSON.parse(JSON.stringify(initialBorders))

getBorder = function(type, initial) {
  var findType = type
  var array = (initial ? initialBorders : borders)
  return array.filter(function(e) { return e.type === findType })
}

setBorder = function(type, value) {
  var findType = type
  var b = borders.filter(function(e) { return e.type === findType })
  if (b[0].value != value) {
    b[0].value = value
    logBordersDDP();    
  }
}

resetBorders = function() {
  setBorder("inner", getBorder("inner", true)[0].value)
  setBorder("outer", getBorder("outer", true)[0].value)
}

var manageBorders = function () {
  if (status.now == "danger") {
    setBorder("inner", 0)
    setBorder("outer", getBorder("outer", true)[0].value +5)
  }
  if (status.now == "ok") {
    resetBorders()
  }  
}

analyzeFilter = function(v){ 
  var bordercondition = ( 
    v > getBorder('inner')[0].value && 
    v < getBorder('outer')[0].value 
  )

  if (v == getBorder("reset")[0].value) {
    console.log("drops out because of reset condition")
    return false
  }
  else return bordercondition

}

///////// INIT

var _ = require('underscore-node');
var wpi = require('wiring-pi');

var now_speaking = false

status = {}

var processes = []

//////// SPEAK

var exec = require('child_process').exec;

speak = function(text, options) {
  if (now_speaking && ( !options || !options.always) ) { console.log ("speech collision"); return }
  else if ( options && options.always ) {
    // kill running speaks
    processes.forEach(function(p){
      p.kill("SIGINT")
      console.log("abort process " + p.pid)
    })
    processes = []
  }
  if (!text) { console.log ("speak nothing"); return }
  now_speaking = true
  params = []
  if (options == null) options = {}
  if (!options.pitch) options.pitch = 100; // default
  //options.pitch += 50; // tweak pitch
  if (options.voice) { params.push("-v " + options.voice) }
  if (options.speed) { params.push("-s " + Math.floor(options.speed)) }
  if (options.pitch) { params.push("-p " + Math.floor(options.pitch)) }
  if (options.amplitude) options.amplitude = options.amplitude * amp_factor
  else options.amplitude = 100 * amp_factor
  if (options.amplitude) { params.push("-a " + Math.floor(options.amplitude)) }
  var cmd = 'espeak ' +  params.join(" ") + ' ' + '"' + text + '"'
  status.lastUtterance = wpi.millis()
  if (logSpeakDDP) logSpeakDDP([text, options])
  console.log(cmd)
  var process = exec(cmd, { timeout: 10000 }, function(error, stdout, stderr) {
    processes.pop() // does not necessarily remove the same process that started it
    now_speaking = false
  });
  processes.push(process)
}

speak("I am here.", {amplitude: 50})

//////// SENSOR

wpi.setup('gpio');

var sensors = [
  { pinTrigger: 6, pinEcho: 17, id: 1},
  { pinTrigger: 5, pinEcho: 27, id: 2},
  { pinTrigger: 6, pinEcho: 22, id: 3},
  { pinTrigger: 5, pinEcho: 10, id: 4},
  { pinTrigger: 6, pinEcho: 9,  id: 5},
  { pinTrigger: 5, pinEcho: 11, id: 6},
  { pinTrigger: 6, pinEcho: 19, id: 7},
  { pinTrigger: 5, pinEcho: 26, id: 8},
]

var measures = {}

sensors.forEach(function(sensor){
  console.log("setup sensor " + sensor.id)
  wpi.pinMode(sensor.pinTrigger, wpi.OUTPUT);
  wpi.pinMode(sensor.pinEcho, wpi.INPUT);
})

measure = function(sensor, callback) {
  //console.log("sensing sensor " + sensor.id)
  var pinTrigger = sensor.pinTrigger
  var pinEcho = sensor.pinEcho
  wpi.digitalWrite(pinTrigger, 1);
  wpi.delayMicroseconds(10)
  wpi.digitalWrite(pinTrigger, 0);

  var StartZeit = wpi.micros()
  var StopZeit = wpi.micros()

  while (wpi.digitalRead(pinEcho) == 0) {
    wpi.delayMicroseconds(1)
  }
  StartZeit = wpi.micros()

  while (wpi.digitalRead(pinEcho) == 1) {
    wpi.delayMicroseconds(1) 
  }
  StopZeit = wpi.micros()

  var delta = StopZeit - StartZeit
  var distance =  Math.round(( delta * 34300 / 2 ) / 1000000)

  wpi.delay(3)

  //console.log("sensor " + sensor.id + " measured " + distance + "cm")

  if (callback) callback()
  return distance
}

doMeasureSequentially = function() {
  for (var i = 0; i < sensors.length; i++) {
    var distance = measure(sensors[i])
    //wpi.delay(100)
    //process.stdout.write(distance + " ")
    sensors[i].last4 = sensors[i].last3
    sensors[i].last3 = sensors[i].last2
    sensors[i].last2 = sensors[i].last
    sensors[i].last = distance
    measures[sensors[i].id] = distance
  }
}

doMeasureAtOnce = function(sensor, callback) {
  //console.log("sensing sensor " + sensor.id)

  var pinsTrigger = _(_(sensors).pluck("pinTrigger")).uniq()

  // reset arrays
  sensors.forEach(function (sensor,i) {
    sensors[i].signalStarted = false
    sensors[i].signalEnded = false
  });
  var inProgress = sensors.length;

  // trigger
  pinsTrigger.forEach(function (pinTrigger) {
    wpi.digitalWrite(pinTrigger, 1);
  });
  wpi.delayMicroseconds(10)
  pinsTrigger.forEach(function (pinTrigger) {
    wpi.digitalWrite(pinTrigger, 0);
  });


  // read
  while (inProgress > 0) {
    sensors.forEach(function (sensor,i) {
      if (!sensor.signalEnded) {
        var read = wpi.digitalRead(sensor.pinEcho)
        if (!sensor.signalStarted && read == 0) { 
          sensors[i].signalStarted = true;
          sensors[i].signalStartTime = wpi.micros();
        }
        if (sensor.signalStarted && read == 1) {
          sensors[i].signalEnded = true;
          sensors[i].signalStopTime = wpi.micros();
          inProgress--
        }
        //console.log(sensor.pinEcho, read)
      }
    });
  }


  // calculate
  sensors.forEach(function (sensor,i) {
    var delta = sensor.signalStopTime - sensor.signalStartTime
    var distance =  Math.round(( delta * 34300 / 2 ) / 1000000)
    sensors[i].last = distance
    measures[sensor.id] = distance
    //console.log("sensor " + sensor.id + " measured " + distance + "cm")
  })
}

fixMeasures = function() {
  sensors.forEach(function (s) {
    if ( s.last < getBorder("inner", true)[0].value
      && s.last == s.last2 
      && s.last2 == s.last3 
      && s.last3 == s.last4) { // probably some artifact
      console.log("resetting sensor " + s.id)
      s.last = getBorder("reset", true)[0].value
      measures[s.id] = getBorder("reset", true)[0].value
    }
  });
  //console.log((_.pluck(sensors,"last")).join(" "))
}


////////////// DDP

var DDPClient = require("ddp");

var ddpclient = new DDPClient({
  // All properties optional, defaults shown
  host : master_network_address,
  port : 3000,
  ssl  : false,
  autoReconnect : true,
  autoReconnectTimer : 500,
  maintainCollections : true,
  ddpVersion : '1',  // ['1', 'pre2', 'pre1'] available
  // uses the SockJs protocol to create the connection
  // this still uses websockets, but allows to get the benefits
  // from projects like meteorhacks:cluster
  // (for load balancing and service discovery)
  // do not use `path` option when you are using useSockJs
  useSockJs: true,
  // Use a full url instead of a set of `host`, `port` and `ssl`
  // do not set `useSockJs` option if `url` is used
  url: 'wss://'+master_network_address+'/websocket'
});

var logMeasuresDDP = function () {
  /*
   * Call a Meteor Method
   */
  if (!ddpclient) return
  try {
    ddpclient.call(
      'logMeasures',             // name of Meteor Method being called
      [measures],            // parameters to send to Meteor Method
      function (err, result) {   // callback which returns the method call results
        //console.log('called function, result: ' + result);
      },
      function () {              // callback which fires when server has finished
        //console.log('updated');  // sending any updated documents as a result of
      }
    );
  }
  catch(err) {
      
  }  
}

var logBordersDDP = function () {
  /*
   * Call a Meteor Method
   */
  if (!ddpclient) return
  try {
    ddpclient.call(
      'logBorders',             // name of Meteor Method being called
      [borders],            // parameters to send to Meteor Method
      function (err, result) {   // callback which returns the method call results
        //console.log('called function, result: ' + result);
      },
      function () {              // callback which fires when server has finished
        //console.log('updated');  // sending any updated documents as a result of
      }
    );
  }
  catch(err) {
      
  }  
}

var logSpeakDDP = function (data) {
  /*
   * Call a Meteor Method
   */
  if (!ddpclient) return
  try {
    ddpclient.call(
      'logSpeak',             // name of Meteor Method being called
      data,            // parameters to send to Meteor Method
      function (err, result) {   // callback which returns the method call results
        //console.log('called function, result: ' + result);
      },
      function () {              // callback which fires when server has finished
        //console.log('updated');  // sending any updated documents as a result of
      }
    );
  }
  catch(err) {
      
  }  
}


console.log('DDP init');

if (sendDDP) {
  ddpclient.connect(function(error, wasReconnect) {

    // If autoReconnect is true, this callback will be invoked each time
    // a server connection is re-established
    if (error) {
      console.log('DDP connection error!');
      return;
    }

    if (wasReconnect) {
      console.log('Reestablishment of a connection.');
    }

    console.log('connected!');

    logBordersDDP();
  })  
}

////////////// ACTION

analyze = function() {
  var values = _.values(measures)
  var min = _.min(values)
  //if (min < 65 && min > 10) {
  if ( _.filter(values, analyzeFilter).length > 0 ) {
    var current = "danger"
  }
  else {
    if ( wpi.millis() - status.lastChange > 1000  // stay at least some milliseconds in state
      && status.before == "danger"  // exclude single value anomaly
      || status.before == undefined )
    var current = "ok"
    touchHasSpoken = false
  }
  status.beforebefore = status.before
  status.before = status.now
  status.now = current || status.now
  if (status.now != status.before) {
    status.lastChange = wpi.millis()
  }
}

touchHasSpoken = false
subAnalyze = function() {
  var values = _.values(measures)
  var min = _.min(values)
  if (status.now == "danger" && min < getBorder("touch", true)[0].value && !touchHasSpoken)
    status.sub = "touch"
  else
    status.sub = "normal"
}

act = function() {
  if (status.sub == "touch") {
    speak("No", { amplitude: r(3,20), pitch: r(100,120) })
    touchHasSpoken = true
  }  
  else if (status.before != status.now ) {
    if (status.now == "danger") { // moving close
      console.log("intrusion")
      if (r(1,16) == 1) {
        speak("keep the distance. ", { amplitude: 50, speed: 50, pitch: r(40,120), always: true })  
      }
      else {
        speak("No ".repeat(r(1,4)) + ".", { always: true })
      }
    }
    else { // moving away
      if (r(1,4) == 1) speak("Yes")
    }
  }
  else if (status.now == "danger" && (wpi.millis()-status.lastChange > 3000) && (wpi.millis()-status.lastUtterance > 1000)) { // stay close
    speak((var_nope()+" ").repeat(r(0,2)))
  }
  else if (status.now == "ok" && wpi.millis()-status.lastUtterance >1000 && Math.random() < 0.2) { // stay far
    var options = {}
    options.pitch = 20 + (Math.random() * 60)
    options.speed = 40 + (Math.random() * 40)
    options.amplitude = r(20,100)

    if (r(1,6) == 1) {
      speak( (r(1,5) == 1 ? "Come closer " : "Please"), { amplitude: 50, speed: 30 })  
    }
    else {
      speak("Yes", options)
    }
  }
}

var last_beuys = 0
act_beuys = function() {
  amp_factor = 1
  if (status.before != status.now || wpi.millis()-status.lastUtterance > 100000) {
    if (status.now == "danger" || (Math.random() + last_beuys) < 0.5 ) { // moving close
      speak("Ja" + var_punctuation() + " ja ja ja.", {
        voice: "mb/mb-de"+r(3,6), 
        //voice: "de",
        speed: r(40,100),
        //speed: r(60,120),
        //pitch: r(80,120),
        pitch: r(20,60),
      })
      last_beuys = 1
    }
    else { // moving away
      speak("Nein!" + " Nein".repeat(r(3,5)) + ".", {
        voice: "mb/mb-de"+r(3,5), 
        //voice: "de",
        speed: r(40,100),
        //speed: r(60,120),
        //pitch: r(80,120),
        pitch: r(20,60),
      })
      last_beuys = 0
    }
  }
}

act_positive = function() {
  if (status.before != status.now || wpi.millis()-status.lastUtterance > 2000) {
    if (status.now == "danger" || (Math.random() + last_beuys) < 0.5 ) { // moving close
      var str = "you are "
      switch (r(1,4)) {
        case 1: str += "awesome"
          break;
        case 2: str += "fantastic"
          break;
        case 3: str += "great"
          break;
      }
      speak(str)
    }
  }
  else if (status.now == "danger") {
    if (r(1,5) == 1) {
      speak("I love you")
    }
  }
}


r = function(min, max) {
  return Math.floor(Math.random() * (max-min) + min)
}

r_choice = function(a) {
  return _.sample(a)
}

String.prototype.repeat = function( num )
{
    return new Array( num + 1 ).join( this );
}

var_nope = function() {
  return _.sample(["No", "no?", "Nope", "No way", "No thanks."])
}

var_punctuation = function() {
  return _.sample([".", ",", " ", "?", "..."])
}


//////////////// MAIN LOOP

setInterval ( function() {
  var startTime = wpi.millis()
  doMeasureSequentially()
  //doMeasureAtOnce()
  
  fixMeasures()
  
  logMeasuresDDP(measures)
  analyze()
  subAnalyze()
  act()
  manageBorders()
  //act_beuys()
  //act_positive()
  //console.log(status)
  //console.log(borders)
  //console.log(initialBorders)
  var endTime = wpi.millis()
  //console.log("full circle time: " + ( endTime - startTime ) )
}, 100)

///////// CONFIG

//var master_network_address = "192.168.5.1"
var master_network_address = "192.168.0.3"

var amp_factor = 2;


///////// INIT

var _ = require('underscore-node');
var wpi = require('wiring-pi');

var now_speaking = false

status = {}

//////// SPEAK

var exec = require('child_process').exec;

speak = function(text, options) {
  if (now_speaking) return
  now_speaking = true
  params = []
  if (options == null) options = {}
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
  exec(cmd, function(error, stdout, stderr) {
    now_speaking = false
  });  
}

speak("I am here.", {amplitude: 50})

//////// SENSOR

wpi.setup('gpio');

var sensors = [
  { pinTrigger: 6, pinEcho: 17, id: 1},
  { pinTrigger: 5, pinEcho: 27, id: 2},
  { pinTrigger: 6, pinEcho: 22, id: 3},
  { pinTrigger: 5, pinEcho: 10, id: 4},
  { pinTrigger: 6, pinEcho: 9, id: 5},
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
    StartZeit = wpi.micros()
  }

  while (wpi.digitalRead(pinEcho) == 1) {
    StopZeit = wpi.micros()
  }

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
    //process.stdout.write(distance + " ")
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
})

////////////// ACTION

analyze = function() {
  var values = _.values(measures)
  var min = _.min(values)
  //if (min < 65 && min > 10) {
  if ( _.filter(values, function(v){ return (v > 12 && v < 90) }).length > 0 ) {
    var current = "danger"
  }
  else {
    var current = "ok"
  }
  status.before = status.now
  status.now = current
  if (status.now != status.before) {
    status.lastChange = wpi.millis()
  }
}

act = function() {
  if (status.before != status.now ) {
    if (status.now == "danger") { // moving close
      if (r(1,16) == 1) {
        speak("keep the distance. ", { amplitude: 50, speed: 50, pitch: r(40,120) })  
      }
      else {
        speak("No ".repeat(r(1,4)) + ".")
      }
    }
    else { // moving away
      if (r(1,4) == 1) speak("Yes")
    }
  }
  else if (status.now == "danger" && (wpi.millis()-status.lastChange > 3000) && (wpi.millis()-status.lastUtterance > 1000)) { // stay close
    speak((var_nope()+" ").repeat(r(0,2)))
  }
  else if (status.now == "ok" && wpi.millis()-status.lastUtterance >1000 && Math.random() < 0.2) {
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
  doMeasureSequentially()
  //doMeasureAtOnce()
  logMeasuresDDP(measures)
  analyze()
  act()
  //act_beuys()
  //act_positive()
  //console.log(status)
}, 550)

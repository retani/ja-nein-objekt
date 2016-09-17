///////// INIT

var _ = require('underscore-node');


//////// SPEAK

var exec = require('child_process').exec;

speak = function(text, options) {
  params = []
  if (options == null) options = {}
  if (options.voice) { params.push("-v " + options.voice) }
  if (options.speed) { params.push("-s " + options.speed) }
  if (options.pitch) { params.push("-p " + options.pitch) }
  if (options.amplitude) { params.push("-a " + options.amplitude) }
  var cmd = 'espeak ' +  params.join(" ") + ' ' + '"' + text + '"'
  exec(cmd, function(error, stdout, stderr) {
  });  
}

speak("ok")

//////// SENSOR

var wpi = require('wiring-pi');

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

  wpi.delay(1)

  //console.log("sensor " + sensor.id + " measured " + distance + "cm")
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

//var master_network_address = "192.168.5.1"
var master_network_address = "192.168.178.25"

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

status = {}

analyze = function() {
  var values = _.values(measures)
  var min = _.min(values)
  if (min < 65 && min > 10) {
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
  if (status.before != status.now || status.now == "danger" && (wpi.millis()-status.lastChange > 3000) ) {
    if (status.now == "danger") {
      speak("No")
    }
    else {
      speak("Yes")
    }
  }
}

//////////////// MAIN LOOP

setInterval ( function() {
  doMeasureSequentially()
  //doMeasureAtOnce()
  logMeasuresDDP(measures)
  analyze()
  act()
  console.log(status)
}, 500)

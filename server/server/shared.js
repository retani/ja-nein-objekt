var exec = require('child_process').exec;

speak_delay = 160;

speak = function(text, options) {
  console.log("trying speak")
  params = []
  if (options == null) options = {}
  if (options.voice) { params.push("-v " + options.voice) }
  if (options.speed) { params.push("-s " + options.speed) }
  if (options.pitch) { params.push("-p " + options.pitch) }
  if (options.amplitude) { params.push("-a " + options.amplitude) }
  var cmd = 'espeak ' +  params.join(" ") + ' ' + '"' + text + '"'
  Meteor.setTimeout(function(){
    exec(cmd, function(error, stdout, stderr) {});  
  },speak_delay)
  var doc = {
    cmd: cmd,
    time: Date.now()
  }
  Commands.insert(doc)
}
Meteor.methods({
  'logMeasures'(data) {
    //console.log("received: ", data)
    var doc = {
      values: data,
      time: Date.now()
    }
    Measures.insert(doc)
    return 1
  },
  'logSpeak'(text, options) {
    console.log("received: ", text, options)
    speak(text, options)
    return 1
  },
  'logBorders'(data) {
    console.log("received: ", data)
    var doc = {
      data: data,
      time: Date.now()
    }
    Borders.insert(doc)
    return 1
  }  
});


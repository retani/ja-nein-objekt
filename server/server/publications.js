Meteor.publish('currentMeasures', function() {
  return Measures.find({},{limit: 1, sort: {time: -1}})
});
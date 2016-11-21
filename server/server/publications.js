Meteor.publish('currentMeasures', function() {
  return Measures.find({},{limit: 1, sort: {time: -1}})
});

Meteor.publish('MeasureHistory', function() {
  return Measures.find({},{limit: 10, sort: {time: -1}})
});

Meteor.publish('commands', function() {
  return Commands.find({},{limit: 10, sort: {time: -1}})
});

Meteor.publish('borders', function() {
  return Borders.find({},{limit: 1, sort: {time: -1}})
});
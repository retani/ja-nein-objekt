import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';

import './main.html';


Template.hello.onCreated(function helloOnCreated() {
  // counter starts at 0
  this.counter = new ReactiveVar(0);
  this.subscribe('currentMeasures');
});

Template.hello.helpers({
  counter() {
    return Template.instance().counter.get();
  },
  values() {
    return _.values(Measures.findOne().values)
  },
  number() {
    return _.values(Measures.findOne().values).length
  },  
  time() {
    return Measures.findOne().time
  }  
});

Template.hello.events({
  'click button'(event, instance) {
    // increment the counter when button is clicked
    instance.counter.set(instance.counter.get() + 1);
  },
});

Template.graph.onRendered( function () {
    this.subscribe('currentMeasures', function(){
      Measures.find().observe({
        added: function(newDoc, oldDoc) {
          updateGraph(_.values(newDoc.values))
        },
        changed: function(newDoc, oldDoc) {
          updateGraph(_.values(newDoc.values))
        }        
      })
    });
 
})

updateGraph = function(data) {

  console.log("render canvas ",data)

  var ctx = document.getElementById('graph-canvas').getContext('2d');
  
  var sizeWidth = ctx.canvas.clientWidth;
  var sizeHeight = ctx.canvas.clientHeight;

  console.log(sizeWidth, sizeHeight)
  
  var numberOfSides = data.length,
      scale = 0.5,
      unscaledInnerCircleRadius = 12,
      unscaledOuterCircleRadius = 80,
      Xcenter = sizeWidth/2,
      Ycenter = sizeHeight/2;
      
  data = data.map(function(x){ return x*scale })

  // clear
  ctx.globalAlpha = .9;
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.clearRect(0, 0, sizeWidth, sizeHeight);

  // circle 1m
  if (unscaledInnerCircleRadius) {
    ctx.beginPath();
    ctx.arc(Xcenter,Ycenter,unscaledInnerCircleRadius*scale,0,2*Math.PI);
    ctx.strokeStyle = "#0f0";
    ctx.stroke();  
  }
  ctx.beginPath();
  ctx.arc(Xcenter,Ycenter,unscaledOuterCircleRadius*scale,0,2*Math.PI);
  ctx.strokeStyle = "#0f0";
  ctx.stroke();  


  // polygon edges
  ctx.beginPath();
  ctx.moveTo (Xcenter + size * Math.cos(0), Ycenter +  size *  Math.sin(0));          
   
  for (var i = 1; i <= numberOfSides;i += 1) {
      var size = data[i-1]
      ctx.lineTo (Xcenter + size * Math.cos(i * 2 * Math.PI / numberOfSides), Ycenter + size * Math.sin(i * 2 * Math.PI / numberOfSides));
  }

  // polygon closing stroke
  ctx.lineTo (Xcenter + data[0] * Math.cos(1 * 2 * Math.PI / numberOfSides), Ycenter + data[0] * Math.sin(1 * 2 * Math.PI / numberOfSides));

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1;
  ctx.setLineDash([1,0]);
  ctx.stroke();
}
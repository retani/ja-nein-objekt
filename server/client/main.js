import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Session } from 'meteor/session'

import './main.html';


Template.hello.onCreated(function () {
  // counter starts at 0
  this.counter = new ReactiveVar(0);
  this.subscribe('currentMeasures');
});

Template.hello.helpers({
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

Template.balken.onCreated(function () {
  // counter starts at 0
  this.counter = new ReactiveVar(0);
  this.subscribe('currentMeasures');
});

Template.balken.helpers({
  values() {
    return _.values(Measures.findOne().values)
  }, 
});

Template.graph.onRendered( function () {
    this.subscribe('currentMeasures', function(){
      Measures.find().observe({
        added: function(newDoc, oldDoc) {
          var borders = (Borders.findOne() ? Borders.findOne().data : null)
          updateGraph(_.values(newDoc.values), borders)
        },
        changed: function(newDoc, oldDoc) {
          var borders = (Borders.findOne() ? Borders.findOne().data : null)
          updateGraph(_.values(newDoc.values), borders)
        }        
      })
    });
    this.subscribe('borders', function(){
      console.log(Borders.findOne())
    })
})

Template.commands.onCreated(function () {
  this.subscribe('commands');
});

Template.commands.helpers({
  list() {
    return Commands.find()
  },
});

Template.chart.rendered = function(){
  var template = this

  var height = "50vh"

  $(".ct-chart").css("height", height)

  this.subscribe('MeasureHistory', function() {
    chart = new Chartist.Line('.ct-chart', {
        series: [
        ]
    }, {
        fullWidth: true,
        showArea: false,
        showLine: true,
        showPoint: false,  
        low: 0,      
        high: 200,
        height: height,
        width: "100vw"
    });
    
    Measures.find().observe({
      added: function(newDoc, oldDoc) {
        addToHistory(newDoc.values)
      },
      changed: function(newDoc, oldDoc) {
        addToHistory(newDoc.values)
      }        
    });

    template.autorun(function(){
      chart.update({series:Session.get('history')})
    })

  })
}

addToHistory = function(values) {
  var vals = []
  for (v in values) { vals.push(values[v]) }
  //console.log(vals, typeof(vals))
  if (!Session.get('history')) {
    var h = []
    vals.forEach(function (v,i) {
      h.push([v])
    });    
    //console.log(h)
  }
  else {
    var h = Session.get('history')
    //console.log(h)
    vals.forEach(function (v,i) {
      h[i].push(v)
    });    
  }
  if (h[0].length > 30) {
    h.forEach(function (e) {
      e.shift()
    });
  }
  Session.set('history', h);
}

updateGraph = function(data, borders) {

  //console.log("render canvas ",data)

  var ctx = document.getElementById('graph-canvas').getContext('2d');
  
  var sizeWidth = ctx.canvas.clientWidth;
  var sizeHeight = ctx.canvas.clientHeight;

  //console.log(sizeWidth, sizeHeight)


  
  var numberOfSides = data.length,
      scale = 0.5,
      unscaledInnerCircleRadius = 0,
      unscaledOuterCircleRadius = 0,
      Xcenter = sizeWidth/2,
      Ycenter = sizeHeight/2;

  if (borders && borders[0] && borders[0].value) var unscaledInnerCircleRadius = borders[0].value
  if (borders && borders[1] && borders[1].value) var unscaledOuterCircleRadius = borders[1].value
      
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
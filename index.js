var colors = [
  new BABYLON.Color3(0.5, 0, 0.7),
  new BABYLON.Color3(0.7, 0.5, 0),
  new BABYLON.Color3(0, 0.7, 0.5),
]
var color_update_interval = 10;

var Bar = function(obj) {
  var self = this;

  var history_size = 20;
  var values = [];

  var last_update_time = 0;
  var color_idx = 0;

  self.get_values = function() {
    return values;
  }

  function scale_value(value) {
    var mean = 0;
    for (var i in values) {
      mean += values[i];
    }
    mean += (history_size / 2) * 128;
    mean /= (values.length + history_size / 2);

    var std = 0;
    for (var i in values) {
      std += (values[i] - mean) * (values[i] - mean);
    }
    std = Math.sqrt(std);

    if (std == 0) {
      return 0;
    }
    return (value - mean) / std;
  }

  self.set_frequencies = function(low_f, high_f) {
    self.low_f = low_f;
    self.high_f = high_f;
  };

  self.update = function(fft, t) {
    var value = 0;
    for (var i = self.low_f; i < self.high_f; i++) {
      value += fft[i];
    }
    value /= (self.high_f - self.low_f);

    values.push(value);
    if (values.length > history_size) {
      values.shift();
    }
    scaled_value = scale_value(value);

    var new_scale = new BABYLON.Vector3(1, Math.max(0.01, 25 * scaled_value), 1);
    obj.scaling = BABYLON.Vector3.Lerp(obj.scaling, new_scale, .8);
    obj.position.y = obj.scaling.y / 2;

    var dt = t - last_update_time;
    if (dt >= color_update_interval) {
      last_update_time = t;
      color_idx = (color_idx + 1) % colors.length;
    }

    obj.material.emissiveColor = BABYLON.Color3.Lerp(
      colors[color_idx], colors[(color_idx + 1) % colors.length],
      (t - last_update_time) / color_update_interval);
  };
};

var gbar;  // for interactive debugging

function setup_bars(scene, num_bars, radius) {

  var material = new BABYLON.StandardMaterial("m", scene);
  var angle = 2 * Math.PI / num_bars;
  var base_obj = BABYLON.Mesh.CreateBox("bar", 1, scene);
  base_obj.material = material;
  base_obj.isVisible = false;

  var ret = [];
  for (var i = 0; i < num_bars; i++) {
    var obj = base_obj.createInstance("bar" + i);

    obj.scaling.x = 1.0;
    obj.scaling.y = 1.0;
    obj.scaling.z = 1.0;

    obj.position.x = radius * Math.sin(angle * i);
    obj.position.y = obj.scaling.y / 2;
    obj.position.z = radius * Math.cos(angle * i);

    obj.rotation.y = angle * i;

    ret[i] = new Bar(obj);
    if (i == 10) {
      gbar = ret[i];
    }
  }

  return ret;
}

function create_scene(engine) {
  var scene = new BABYLON.Scene(engine);
  scene.clearColor = BABYLON.Color3.Black();

  var camera = new BABYLON.ArcRotateCamera(
    'camera', 0, Math.PI / 4, 40, BABYLON.Vector3.Zero(), scene);
  camera.setTarget(BABYLON.Vector3.Zero());

  var light = new BABYLON.HemisphericLight(
    "light1", new BABYLON.Vector3(0, 1, 0), scene);

  var bars = setup_bars(scene, 30, 10);

  var analyser = new BABYLON.Analyser(scene);
  BABYLON.Engine.audioEngine.connectToAnalyser(analyser);
  analyser.FFT_SIZE = 512;
  analyser.SMOOTHING = 0.9;

  var num_bins = analyser.FFT_SIZE / 2;
  var low_offset = 0;
  var high_offset = 1 / 6;
  var df = Math.trunc((1 - low_offset - high_offset) * num_bins / bars.length);
  for (var i = 0; i < bars.length; i++) {
    bars[i].set_frequencies(
      i * df + low_offset * num_bins,
      (i + 1) * df + low_offset * num_bins);
  }

  var t = 0.0;
  scene.registerBeforeRender(function() {
    var fft = analyser.getByteFrequencyData();
    for (var i in bars) {
      bars[i].update(fft, t);
    }

    camera.alpha = t / 20;
    t += 0.1;
  });
  return scene;
}

function create_ui(scene, manager) {
  var canvas = new BABYLON.ScreenSpaceCanvas2D(scene, {
		id: 'ScreenCanvas', backgroundRoundRadius: 10 });

  var button_text = new BABYLON.Text2D(
    'Pause', {
      marginAlignment: 'h: center, v: center',
      fontName: '20pt Arial',
    });
  var button = new BABYLON.Rectangle2D({
      parent: canvas, id: 'button', x: 60, y: 100, width: 200, height: 80,
			fill: "#40C040FF", roundRadius: 10,
			children: [button_text],
	});

  button.pointerEventObservable.add(function () {
    if (manager.is_paused) {
      manager.start();
      button_text.text = 'Pause';
    } else {
      button_text.text = 'Resume';
      scene.render();  // to render button change
      manager.pause();
    }
  }, BABYLON.PrimitivePointerInfo.PointerUp);
}

var SceneManager = function() {

  var self = this;

  var canvas = $('#renderCanvas')[0];
  var engine = new BABYLON.Engine(canvas, true);
  var scene = create_scene(engine);
  create_ui(scene, self);

  var music_file = 'music/idols.mp3';
  var music = new BABYLON.Sound(
    'Music',
    'music/idols.mp3',
    scene, null, {autoplay: true});

  self.start = function() {
    engine.runRenderLoop(function() {
      scene.render();
    });
    music.play();
    self.is_paused = false;
  };

  self.pause = function() {
    music.pause();
    engine.stopRenderLoop();
    self.is_paused = true;
  };
}

$(function() {
  var manager = new SceneManager();
  manager.start();
});

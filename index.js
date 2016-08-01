var colors = [
  new BABYLON.Color3(0.5, 0, 0.7),
  new BABYLON.Color3(0.7, 0.5, 0),
  new BABYLON.Color3(0, 0.7, 0.5),
]
var color_update_interval = 20;

var Bar = function(obj) {
  var self = this;

  var history_size = 20;
  var values = [];

  var last_update_time = 0;
  var color_idx = 0;

  function scale_value(value) {
    var mean = 0;
    for (var i in values) {
      mean += values[i];
    }
    mean += (history_size / 2) * 150;
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
    obj.scaling = BABYLON.Vector3.Lerp(obj.scaling, new_scale, .6);
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
  var high_offset = 1 / 3;
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

var SongManager = function(manager) {
  var self = this;
  self.song_name_to_file = {
    'Idols': 'idols',
    'LRAD': 'lrad',
    'Razor Sharp': 'razor_sharp',
    'Self Destruct': 'self_destruct',
    'Strangers': 'strangers',
    'Thunderclap': 'thunderclap',
  };

  var songs = [];
  for (var i in self.song_name_to_file) {
    songs.push(self.song_name_to_file[i]);
  }

  var song_to_sound = {};
  for (var i = 0; i < songs.length; i++) {
    var song = songs[i];
    var filename = `music/${song}.mp3`

    var sound = new BABYLON.Sound(
      song, filename, manager.scene, null);
    sound.autoplay = i == 0;

    var next_song = songs[(i + 1) % songs.length];
    // next_song needs to have its own scope
    sound.onended = (function(next_song) {
      return function() {
        manager.set_song_from_end(next_song);
      };
    })(next_song);

    song_to_sound[song] = sound;
  }

  var current_sound = song_to_sound[songs[0]];
  self.play_song = function(song) {
    current_sound.stop();
    current_sound = song_to_sound[song];
    current_sound.play();
  };

  self.pause = function() {
    current_sound.pause();
  };

  self.resume = function() {
    current_sound.play();
  };

  self.first_song = songs[0];
};

var Manager = function() {
  var self = this;

  var canvas = $('#renderCanvas')[0];
  var engine = new BABYLON.Engine(canvas, true);
  self.scene = create_scene(engine);

  var song_manager = new SongManager(self);
  var config = {
    song: song_manager.first_song,
    paused: false,
  };
  var gui = new dat.GUI();
  gui.add(config, 'song', song_manager.song_name_to_file).onChange(function (v) {
    self.set_song_from_gui(v);
  });
  gui.add(config, 'paused').onChange(function(v) {
    self.toggle_paused(v);
  });

  // start engine on initialization
  engine.runRenderLoop(function() {
    self.scene.render();
  });

  self.toggle_paused = function(paused) {
    if (paused) {
      song_manager.pause();
      engine.stopRenderLoop();
    } else {
      engine.runRenderLoop(function() {
        self.scene.render();
      });
      song_manager.resume();
    }
  };

  self.set_song_from_gui = function(song) {
    song_manager.play_song(song);
  }

  self.set_song_from_end = function(song) {
    // manually update the GUI when a song ends
    config.song = song;
    for (var i in gui.__controllers) {
      gui.__controllers[i].updateDisplay();
    }
    song_manager.play_song(song);
  }
};

var manager;  // global for debugging
$(function() {
  manager = new Manager();
});

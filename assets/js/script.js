/*jslint browser:true */
/*global Phaser, $ */
(function () {
  'use strict';

  var SPEED = 250,
      MAX_SPEED_LIMIT = 3,
      MIN_SPEED_LIMIT = 0.25,

      IMPULSION = -420,
      GRAVITY = 1200,
      FLOAT_CONST = 0.4,

      SPAWN_RATE = 1,
      BONUS_RATE = 2.9,
      WALLS_BEFORE_BONUSES = 3,

      OPENING = 200,
      OFFSET_FOR_SCORE = 50,
      TIME_BEFORE_PLAYING_MS = 500,

      BONUS_OBJECTS_ARRAY,
      BONUS_DURATION = 3000,

      TEXT_COLOR = "#FFF",
      INFO_STYLE = {
        'fill': '#FFFF00',
        'strokeThickness': 4
      },
      INVINCIBLE_COLOR_TINT = 0xFFFF00,
      NORMAL_COLOR_TINT = 0xFFFFFF,

      timeouts_array,
      state,
      I18N,
      game;

  function _fillBonusObjects(data) {
    BONUS_OBJECTS_ARRAY = [
      {
      'name': 'coin',
      'message': data.bonus.messages.coin
      },
      {
        'name': 'star',
        'message': data.bonus.messages.star
      },
      {
        'name': 'minirock',
        'message': data.bonus.messages.minirock
      },
      {
        'name': 'algae',
        'message': data.bonus.messages.algae
      },
      // {
      //   'name': 'shell',
      //   'message': data.bonus.messages.shell
      // },
      {
        'name': 'whirlpool',
        'message': data.bonus.messages.whirlpool
      }
    ];
  }

  String.prototype.capitalize = function () {
    return this.charAt(0).toUpperCase() + this.slice(1);
  };

  Array.prototype.contains = function (value) {
    return this.indexOf(value) > -1;
  };

  state = {
    preload: function () {
      this.load.image("wall", "assets/game/img/rock.png");
      this.load.image("background", "assets/game/img/pool.jpg");
      this.load.spritesheet("player", "assets/game/img/octopus.png", 38, 52);

      BONUS_OBJECTS_ARRAY.forEach(function (bonus) {
        this.load.spritesheet(bonus.name, "assets/game/img/" + bonus.name + ".png", 32, 32);
      }, this);

      this.load.audio("swim", "assets/game/snd/swim.wav");
      this.load.audio("score", "assets/game/snd/score.wav");
      this.load.audio("dead", "assets/game/snd/dead.wav");
    },

    create: function () {
      this._initPhysics();
      this._initKeybindings();
      this._initScene();
      this._initSounds();
      this._initPlayer();
      this.reset();
    },

    _initPhysics: function () {
      this.gravityFactor = -1;
      this.speedFactor = 1;
      this.physics.startSystem(Phaser.Physics.ARCADE);
      this.physics.arcade.gravity.y = GRAVITY * this.gravityFactor;
    },

    _initKeybindings: function () {
      this.input.keyboard.addKey(Phaser.Keyboard.R).onDown.add(this.toggleRules, this);
      this.input.keyboard.addKey(Phaser.Keyboard.M).onDown.add(this.toggleSounds, this);
      this.input.keyboard.addKey(Phaser.Keyboard.P).onDown.add(this.pauseGame, this);
      this.input.keyboard.addKey(Phaser.Keyboard.SPACEBAR).onDown.add(this.swim, this);
      this.input.onDown.add(this.swim, this);
      if (this.input.pointer1.isDown) {
        this.swim();
      }
    },

    _initScene: function () {
      this.background = this.add.tileSprite(0, 0, this.world.width, this.world.height, 'background');
      this.walls = this.add.group();
      this.objects = this.add.group();

      this.scoreText = this.add.text(
        this.world.centerX,
        this.world.height / 6,
        "",
        {
          size: "32px",
          fill: TEXT_COLOR,
          align: "center",
          stroke: "#333333",
          strokeThickness: 0,
        }
      );
      this.scoreText.anchor.setTo(0.5, 1);

      this.countdownText = this.add.text(
        this.world.centerX,
        this.world.centerY / 1.5,
        "",
        {
          size: "48px",
          fill: TEXT_COLOR,
          align: "center"
        }
      );
      this.countdownText.alpha = 1;
      this.countdownText.anchor.setTo(0.5, 0.5);
    },

    _initSounds: function () {
      this.allMuted = false;
      this._makeSoundSettings();
      this.swimSnd = this.add.audio('swim');
      this.scoreSnd = this.add.audio('score');
      this.deadSnd = this.add.audio('dead');
    },

    _initPlayer: function () {
      this.player = this.add.sprite(0, 0, 'player');
      this.player.anchor.setTo(0.5, 0.5);
      this.player.animations.add('float', [0, 1, 2, 3], 10, true);
      this.player.animations.add('swim', [4, 5, 6, 6, 5, 4, 7], 8, true);
      this.player.animations.add('dead', [7, 8, 10, 9], 15, false);
      this.physics.arcade.enableBody(this.player);
      this.player.body.collideWorldBounds = true;
    },


    update: function () {
      this._updatePlayerAnimation();
      this._detectCollisions();
      this._countPassedWalls();
      this._floatObjects("objects", FLOAT_CONST, true);
    },

    _updatePlayerAnimation: function () {
      var f, anim = this.player.body.velocity.y > -20 ? 'float' : 'swim';
      if (this.gameOver || !this.gameStarted) {
        f = this.gameOver ? FLOAT_CONST : 1;
        return this._floatObjects(this.player, f, false);
      }
      this.player.animations.play(anim);
    },

    _detectCollisions: function () {
      if (this.gameStarted && !this.gameOver) {
        if (this.player.body.bottom >= this.world.bounds.bottom
          || this.player.body.bottom <= this.world.bounds.top + this.player.height) {
            this.setGameOver();
          }
          this.physics.arcade.collide(this.player, this.walls, this.setGameOver, null, this);
          this.physics.arcade.overlap(this.player, this.objects, this.playerHitBonus, null, this);
          this.physics.arcade.overlap(this.walls, this.objects, this.removeObjectsFromWalls, null, this);
      }
    },

    _countPassedWalls: function () {
      if (this.gameStarted && !this.gameOver) {
        this.walls.forEachAlive(function (wall) {
          if (wall.x + wall.width < game.world.bounds.left) {
            wall.kill();
          } else if (!wall.scored && wall.x < state.player.x - OFFSET_FOR_SCORE) {
            state.addScore(0.5, wall);
          }
        });
      }
    },

    _floatObjects: function (obj, factor, isColl) {
      if (isColl) {
        this[obj].forEachAlive(function (o) {
          o.y += factor * Math.cos(game.time.now / 200);
        });
      } else {
        obj.y += factor * Math.cos(this.time.now / 200);
      }
    },

    showCountdown: function (before, number, after, style, callback, context) {
      var that = context || this;
      if (number) {
        that.countdownText.setStyle(style);
        that.countdownText.setText(before + number + after);
        timeouts_array.push(setTimeout(function () {
          that.showCountdown(before, number - 1, after, style, callback, that);
        }, 1000));
      } else {
        that.countdownText.setText("");
        if (callback) {
          callback.call();
        }
      }
    },


    reset: function () {
      this._resetGameState();
      this._resetPlayer();
      this._resetScreen();
    },

    _resetGameState: function () {
      this._initPhysics();
      this.gameStarted = false;
      this.gameOver = false;
      this.score = 0;
      timeouts_array = [];
      this.pauseTotalTime = 0;
      this.newBestScore = false;
      this.spawnedWalls = 0;
      this.background.autoScroll(-SPEED * 0.8 * this.speedFactor, 0);
    },

    _resetPlayer: function () {
      this.player.angle = 0;
      this.player.scale.x = -1;
      this.player.body.allowGravity = false;
      this.player.reset(this.world.width / 3, this.world.centerY);
      this.player.animations.play('float');
      game.add.tween(this.player).from({
        y: -150
      }, 1500, Phaser.Easing.Elastic.Out, true);
    },

    _resetScreen: function () {
      this._showGameoverScreen(false);
      this.walls.removeAll();
      this.objects.removeAll();
      this.scoreText.strokeThickness = 0;
      this.scoreText.setText(I18N.general.state.startGame);
      game.add.tween(this.scoreText).from({
        y: - this.game.height / 4
      }, 2000, Phaser.Easing.Elastic.Out, true);
    },

    start: function (){
      this.player.body.allowGravity = true;
      document.getElementById("rulesButton").style.visibility = "hidden";
      this.toggleRules(true);
      this.scoreText.setText(this.score);
      this.scoreText.strokeThickness = 4;
      this.gameStarted = true;
      this.startTime = this.time.now;
      this._setTimers();
    },

    _setTimers: function () {
      this.wallTimer = this.game.time.events.loop(Phaser.Timer.SECOND * SPAWN_RATE, this.spawnWalls, this);
      this.wallTimer.timer.start();
      this.bonusTimer = this.game.time.events.loop(Phaser.Timer.SECOND * BONUS_RATE, this.spawnBonuses, this);
      this.bonusTimer.timer.start();
    },

    pauseGame: function () {
      if (!this.gameOver && !this.gameUnPausing && !this.rulesShown) {
        var v;
        if (game.paused) {
          if (this.gameStarted) {
            this.gameUnPausing = true;
            state.showCountdown("» ", 3, " «", {'fill':'#FFF'}, function () {
              game.paused = false;
              state.gameUnPausing = false;
              state._recordPauseTimeCount(false);
            }, state);
          } else {
            game.paused = false;
          }
          v = "hidden";
        } else {
          state._recordPauseTimeCount(true);
          game.paused = true;
          v = "visible";
        }
        document.getElementById("pauseScreen").style.visibility = v;
        document.getElementById("pauseButton").classList.toggle("pushed");
      }
    },

    _recordPauseTimeCount: function (start) {
      if (start) {
        this.pauseStartTime = this.time.now;
      } else {
        this.pauseEndTime = this.time.now;
        this.pauseTotalTime += this.pauseEndTime - this.pauseStartTime;
        this.pauseStartTime = 0;
      }
    },

    swim: function (){
      if (!this.gameStarted) { this.start(); }
      if (!this.gameOver) {
        this.player.body.velocity.y = IMPULSION * this.gravityFactor * this.speedFactor;
        this.playSound(this.swimSnd);
      } else if (this.time.now > this.timeOver + TIME_BEFORE_PLAYING_MS) {
        this.reset();
      }
    },

    setGameOver: function (){
      this._stopPlayer();
      this._clearTimeouts();
      this._clearTexts();
      this._stopAllObjects();
      this.saveScore();
      this.gameOver = true;
      this.background.autoScroll(0, 0);
      document.getElementById("rulesButton").style.visibility = "visible";
      this.timeOver = this.time.now;
      this.playSound(this.deadSnd);
      this._showGameoverScreen(true);
    },

    _clearTexts: function() {
      this.scoreText.setText("");
      this.countdownText.setText("");
    },

    _clearTimeouts: function() {
      timeouts_array.forEach(function(t) {
        clearTimeout(t);
      });
    },

    _showGameoverScreen: function (show) {
      if (show) {
        if (this.newBestScore) {
          document.getElementById("newrecord").style.visibility = "visible";
        }
        else {
          document.getElementById("newrecord").style.visibility = "hidden";
        }
        document.getElementById("gameoverScreen").style.visibility = "visible";
        document.getElementById("score").innerHTML = I18N.general.scores.score + " : " + state.score;
        document.getElementById("best").innerHTML = I18N.general.scores.best + " : " + state.retrieveBestScore();
        var t = Math.round((game.time.elapsedSince(state.startTime) - this.pauseTotalTime) / 1000) + "s";
        document.getElementById("time").innerHTML = I18N.general.scores.time + " : " + t;
      }
      else {
        document.getElementById("newrecord").style.visibility = "hidden";
        document.getElementById("gameoverScreen").style.visibility = "hidden";
      }
    },

    _stopPlayer: function () {
      this.player.animations.play("dead");
      this.player.body.velocity.x = this.player.body.velocity.y = 0;
      this.player.body.allowGravity = false;
    },

    _stopAllObjects: function () {
      this.walls.forEachAlive(function (wall) {
        wall.body.velocity.x = wall.body.velocity.y = 0;
      });
      this.objects.forEachAlive(function (object) {
        object.body.velocity.x = object.body.velocity.y = 0;
      });
      this.wallTimer.timer.stop();
      this.bonusTimer.timer.stop();
    },

    removeObjectsFromWalls: function (_wall, _object) {
      game.add.tween(_object).to({
        x: _object.x + 20
      }, 300, Phaser.Easing.Elastic.Out, true);
      return _wall;
    },

    playerHitBonus: function (_player, _object) {
      var method = "_collect" + _object._type.capitalize();
      this[method](_object);
      this.displayBonusMessage(_player, _object.message);
    },

    displayBonusMessage: function (origin, message) {
      var infoText = this.add.text(
        origin.x,
        origin.y,
        message,
        {
          size: "18px",
          fill: INFO_STYLE.fill,
          align: "center",
          stroke: "#333",
          strokeThickness: 4
        }
      );
      infoText.alpha = 0;
      infoText.anchor.setTo(0.5, 1);
      game.add.tween(infoText).to({
        alpha: 1,
        y: this.world.centerY / 2,
        x: this.world.centerX
      }, 900, Phaser.Easing.Elastic.Out, true);
      setTimeout(function () {
        game.add.tween(infoText).to({
          alpha: 0
        }, 600, Phaser.Easing.Linear.InOut, true);
        setTimeout(function () {
          infoText.destroy();
        }, 600);
      }, 1200);
    },

    _collectWhirlpool: function (whirlpool) {
      this._reverseGravity();
      whirlpool.kill();
    },

    _reverseGravity: function () {
      this._reversePlayerSense();
      this._slideBackWalls(this);
      this.gravityFactor = - this.gravityFactor;
      this.physics.arcade.gravity.y = GRAVITY * this.gravityFactor;
    },

    _reversePlayerSense: function () {
      var a = this.player.angle === -180 ? 0 : -180;
      game.add.tween(this.player).to({
        angle: a
      }, 600, Phaser.Easing.Quartic.Out, true);
      this.player.scale.x = - this.player.scale.x;
    },

    _collectCoin: function (coin) {
      this.addScore(1);
      coin.kill();
    },

    _collectAlgae: function (algae) {
      algae.kill();
      this._multSpeedFactor(0.5);
      this.showCountdown("» ", BONUS_DURATION / 1000, " «", INFO_STYLE, function() {
        state._multSpeedFactor(2);
      }, this);
    },

    _multSpeedFactor: function (n) {
      if (this.speedFactor >= MIN_SPEED_LIMIT && this.speedFactor <= MAX_SPEED_LIMIT) {
        this.speedFactor *= n;
        this._updateBackgroundSpeed();
      }
    },

    _collectShell: function (shell) {
      shell.kill();
      this._addSpeedFactor(0.5);
      timeouts_array.push(setTimeout(function () {
        state._addSpeedFactor(-0.5);
      }, BONUS_DURATION));
    },

    _addSpeedFactor: function (n) {
      if (this.speedFactor + n <= MAX_SPEED_LIMIT) {
        this.speedFactor += n;
        this._updateBackgroundSpeed();
      }
    },

    _collectMinirock: function () {
      this.setGameOver();
    },

    _collectStar: function (star) {
      star.kill();
      this._becomeInvincible();
    },

    _becomeInvincible: function () {
      this.player.body.enable = false;
      this.player.tint = INVINCIBLE_COLOR_TINT;
      this.speedFactor = 5;
      this._slideBackWalls(this);
      this._updateBackgroundSpeed();
      this.showCountdown("» ", BONUS_DURATION / 1000, " «", INFO_STYLE, function() {
        state._becomeMortal();
      }, this);
    },

    _slideBackWalls: function (context) {
      var self = context;
      this.walls.forEachAlive(function (w) {
        var h = w.flipped ? 0 : self.game.height;
        game.add.tween(w).to({
          y: h
        }, 600, Phaser.Easing.Quartic.Out, true);
      });
    },

    _becomeMortal: function () {
      this.player.body.enable = true;
      this.player.body.velocity.y = 0;
      this.player.tint = NORMAL_COLOR_TINT;
      this.speedFactor = 1;
      this._updateBackgroundSpeed();
    },

    _updateBackgroundSpeed: function () {
      this.background.autoScroll(-SPEED * 0.8 * this.speedFactor, 0);
    },

    spawnBonuses: function () {
      var n = this.rnd.integerInRange(0, this.score + 3);
      if (this.spawnedWalls >= WALLS_BEFORE_BONUSES && n < this.score) {
        var objectNumber = this.rnd.integerInRange(0, BONUS_OBJECTS_ARRAY.length - 1);
        this._spawnBonus(BONUS_OBJECTS_ARRAY[objectNumber], 150);
      }
    },

    _spawnBonus: function (bonus, offset) {
      if (!offset) { offset = 20; }
      var randHeight = this.rnd.integerInRange(offset, game.height - offset);
      var b = this._spawnGenericItem("objects", bonus, game.width, randHeight);
      b.animations.add('animate', [], 20, true);
      b.animations.play('animate');
    },

    spawnWalls: function (){
      var n = this.rnd.integerInRange(0, this.score + 2);
      if (this.spawnedWalls === 0 || n <= this.score) {
        var factor = this.speedFactor > 0.5 ? 1 : Math.random();
        if (factor <= 0.65) { return; }
        var wallY = this.rnd.integerInRange(game.height * 0.3, game.height * 0.7);
        this._spawnWall(wallY);
        this._spawnWall(wallY, true);
        this.spawnedWalls++;
      }
    },

    _spawnWall: function (y, flipped) {
      var opening = OPENING - 5 * this.rnd.integerInRange(0, this.score % 12);
      opening = flipped ? -opening : opening;
      var wall = this._spawnGenericItem("walls", {'name':'wall'}, game.width, y + opening / 2);
      var origin = game.height;
      wall.flipped = false;

      if (flipped) {
        origin = 0;
        wall.scale.y = -1;
        wall.flipped = true;
        wall.body.offset.y = -wall.body.height;
      }
      game.add.tween(wall).from({
        y: origin
      }, 500, Phaser.Easing.Bounce.InOut, true);
    },

    _setItemProps: function (item) {
      this.physics.arcade.enableBody(item);
      item.body.allowGravity = false;
      item.body.immovable = true;
      item.body.velocity.x = -SPEED * this.speedFactor;
    },

    _spawnGenericItem: function (group, item, x, y) {
      var it = this[group].create(x, y, item.name);
      it._type = item.name;
      it.message = item.message;
      this._setItemProps(it);
      return it;
    },

    _updateScoreText: function (score) {
      this.scoreText.setText(score);
    },

    addScore: function (n, wall) {
      if (wall) { wall.scored = true; }
      this.score += n;
      this._updateScoreText(this.score);
      this.playSound(this.scoreSnd);
    },

    retrieveBestScore: function () {
      return Number(localStorage.getItem("splashy_octopus_best_score"));
    },

    saveScore: function () {
      var newScore = this.score;
      var bestScore = this.retrieveBestScore();
      if (newScore > bestScore) {
        this.newBestScore = true;
        localStorage.setItem("splashy_octopus_best_score", newScore);
      }
    },

    playSound: function (sound) {
      if (!this.allMuted) {
        sound.play();
      }
    },

    toggleSounds: function () {
      this.allMuted = !this.allMuted;
      localStorage.setItem("splashy_octopus_muted", this.allMuted);
      var m = this.allMuted ? I18N.general.sound.soundOn : I18N.general.sound.soundOff;
      document.getElementById("muteButton").innerHTML = m;
    },

    _makeSoundSettings: function () {
      if (localStorage.getItem("splashy_octopus_muted") !== this.allMuted.toString()) {
        this.toggleSounds();
      }
    },

    toggleRules: function (hide) {
      if (hide === true) {
        state.rulesShown = false;
        document.getElementById("rulesButton").classList.remove("pushed");
        document.getElementById("rulesScreen").style.visibility = "hidden";
        return;
      }
      if (!state.gameStarted || state.gameOver) {
        state.rulesShown = !state.rulesShown;
        var v = state.rulesShown ? "visible" : "hidden";
        document.getElementById("rulesScreen").style.visibility = v;
        document.getElementById("rulesButton").classList.toggle("pushed");
      }
    }
  };

  function translateGame (data) {
    I18N = data;
    _fillBonusObjects(data);
    $(".lost").text(I18N.general.state.gameOver);
    $(".rulesT").text(I18N.general.rules.rules);
    $(".rules").text(I18N.general.rules.text);
    $("#newrecord").text(I18N.general.scores.record);
    $("#muteButton").text(I18N.general.sound.soundOff);
    $(".playButton").text(I18N.general.state.play);
  }


  document.addEventListener('DOMContentLoaded', function () {
    document.body.addEventListener('keydown', function (e) {
      if (e.which === 32) {
        e.preventDefault();
        if (game.paused) { state.pauseGame(); }
      }
    });
    document.getElementById("pauseButton").addEventListener('click', function () {
      state.pauseGame();
    });
    document.getElementById("muteButton").addEventListener('click', function () {
      state.toggleSounds();
    });
    document.getElementById("rulesButton").addEventListener('click', function () {
      state.toggleRules();
    });
    document.getElementById("gameoverScreen").addEventListener('click', function () {
      state.swim();
    });

    var w = window.innerWidth >= 406 ? 390 : window.innerWidth,
        lang = navigator.language || navigator.userLanguage,
        screens = document.querySelectorAll(".screen"),
        pauseBtn = document.getElementById("pauseButton"),
        muteBtn = document.getElementById("muteButton"),
        rulesBtn = document.getElementById("rulesButton");

    $(".playButton").click(function(e) {
      e.preventDefault();
      $("#main").fadeOut(300);
      setTimeout(function() {
        $("#jeu").fadeIn(300);
        rulesBtn.style.left = window.innerWidth / 2 + w / 2 - rulesBtn.offsetWidth + "px";
      }, 300);
    });

    [].forEach.call(screens, function(screen) {
      screen.style.width = w + "px";
      screen.style.height = window.innerHeight - 16 + "px";
      screen.style.left = window.innerWidth / 2 - w / 2 + "px";
    });

    pauseBtn.style.left = window.innerWidth / 2 - w / 2 + "px";
    muteBtn.style.left = parseInt(pauseBtn.style.left, 10) + 55 + "px";

    // Language settings
    var supported_languages = ['fr', 'en', 'de'],
        default_language = 'en';
    lang = supported_languages.contains(lang) ? lang : default_language;
    $.getJSON( "assets/lang/" + lang + ".json", function(data) {
      translateGame(data);
      game = new Phaser.Game(w, window.innerHeight - 16, Phaser.AUTO, 'game', state);
    });
  });
}());

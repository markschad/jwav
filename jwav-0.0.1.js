/**
 *    jwav-0.0.1.js
 *    Author: Mark Schad
 *    Contact: mark.schad@gmail.com
 *
 *    This program is free software: you can redistribute it and/or modify
 *    it under the terms of the GNU General Public License as published by
 *    the Free Software Foundation, either version 3 of the License, or
 *    any later version.
 *
 *    This program is distributed in the hope that it will be useful,
 *    but WITHOUT ANY WARRANTY; without even the implied warranty of
 *    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *    GNU General Public License for more details.
 *
 *    http://www.gnu.org/licenses/
 */

(function(window, undefined) {

  // jWav constructor.
  var jWav = function() {

    // Return a new jwav object.
    return new jWav.obj();

  };



  // A jWav object.
  jWav.obj = function() {

    this._file = undefined;
    this._data = undefined;

  };



  // Prototype for jWav object methods.
  jWav.obj.prototype = {

    load: function(file, callback) {

      this._file = file;
      this._data = undefined;

      var reader = new FileReader();

      // Call the ready function when the reader has finished laoding.
      reader.onload = (function(w){
        return function() {
          w.ready(reader.result);
          if (typeof callback === 'function')
            callback();
        };
      })(this);

      // Read the file.
      reader.readAsBinaryString(file);

    },



    // Called when a wav file has finished loading into the object.
    ready: function(data) {

      this._data = data;

    },



    // Retrieves the html5 standard file object.
    file: function() {

      return this._file;

    },



    // Retrieves the specified number of bytes from the file at index. endian
    // describes how the bytes should be read. Strings are generally stored
    // big-endian and integers are generally stored little-endian.
    getBytes: function(index, length, endian) {

      endian = typeof endian === 'undefined' ? 'big' : 'little';

      var bytes = [];

      for (var i = 0; i < length; i++)
        bytes[i] = this._data.charCodeAt(index + i);

      if (endian == 'little')
        bytes = bytes.reverse();

      return bytes;

    },


    // The id of the file. This should be 'RIFF'. 'RIFX' means the sample data
    // should be read as big-endian, but this is uncommon.
    chunkId: function() {
      return jWav.wordToString(this.getBytes(0, 4));
    },



    // The total size of the file.
    chunkSize: function() {
      return jWav.wordToInt(this.getBytes(4, 4, 'little'));
    },



    // The file format. This should be 'WAVE'.
    format: function() {
      return jWav.wordToString(this.getBytes(8, 4));
    },



    // The id of the format chunk. This should be 'fmt'.
    subChunk1Id: function() {
      return jWav.wordToString(this.getBytes(12, 4));
    },



    // The size of the format chunk.
    subChunk1Size: function() {
      return jWav.wordToInt(this.getBytes(16, 4, 'little'));
    },



    // The type of wav file this is. This should be 1 (PCM) otherwise there
    // is some form of compression applied to the file.
    audioFormat: function() {
      return jWav.wordToInt(this.getBytes(20, 2, 'little'));
    },



    // How many audio channels are in the file.
    numChannels: function() {
      return jWav.wordToInt(this.getBytes(22, 2, 'little'));
    },



    // How many samples are reserved to describe one second of audio.
    sampleRate: function() {
      return jWav.wordToInt(this.getBytes(24, 4, 'little'));
    },



    // How many bytes are reserved to describe one second of audio.
    byteRate: function() {
      return jWav.wordToInt(this.getBytes(28, 4, 'little'));
    },



    // How many bytes are reserved to describe a single sample.
    blockAlign: function() {
      return jWav.wordToInt(this.getBytes(32, 2, 'little'));
    },



    // How many bits are reserved to describe a single channel in a single
    // sample.
    bitsPerSample: function() {
      return jWav.wordToInt(this.getBytes(34, 2, 'little'));
    },



    // The id of the data chunk. This should be 'data'.
    subChunk2Id: function() {
      return jWav.wordToString(this.getBytes(36, 4));
    },



    // The total size of the data chunk.
    subChunk2Size: function() {
      return jWav.wordToInt(this.getBytes(40, 4, 'little'));
    },



    // The total number of samples in the file.
    numSamples: function() {
      return this.subChunk2Size() / this.numChannels() / this.bitsPerSample() * 8;
    },



    // Retrieves a word describing the sample and all of its channels at index.
    getData: function(index) {
      var offset = 44 + this.blockAlign() * index;
      return this.getBytes(offset, this.blockAlign())
    },



    // Retrieves a single samples from the specified channel at index.  The
    // sample is a value from -1 to 1 describing signal amplitude.
    getSample: function(index, channel) {

      channel = typeof channel === 'undefined' ? 1 : channel;

      if (this.numChannels() == 1 && channel != 1)
        return undefined;

      // Retrieve the word describing the amplitude.
      var width = this.blockAlign() / this.numChannels();
      var begin = width * (channel - 1);
      var end = width * channel;
      var amplitudeWord = this.getData(index).slice(begin, end);

      var amplitude = 0;

      // Retrieve a value between -1 and 1 depending on the bit depth.
      switch (this.bitsPerSample()) {

        // 8-bit.
        case 8:
          amplitude = jWav.wordToInt(amplitudeWord, 'big');
          amplitude = (amplitude > 127 ?
            amplitude - 256 :
            amplitude) / 128;
          break;

        // 24-bit.
        case 24:
          amplitude = jWav.wordToInt(amplitudeWord, 'big');
          amplitude = (amplitude > 8388607 ?
            amplitude - 16777216 :
            amplitude) / 8388608;
          break;

        // 16-bit.
        default:
          amplitude = jWav.wordToInt(amplitudeWord, 'big');
          amplitude = (amplitude > 32767 ?
            amplitude - 65536 :
            amplitude) / 32768;
          break;


      }

      // Return the amplitude.
      return amplitude;

    },


    // Retrieves length number of samples from the specified channel beginning
    // at index and with a specified resolution.  1 is the finest resolution and
    // greater numbers describe how many samples will be averaged together and
    // stored within a single index of the returned array of samples.
    getSamples: function(index, length, channel, resolution) {

      channel = typeof channel === 'undefined' ? 1 : channel;
      resolution = typeof resolution === 'undefined' ? 1 : resolution;

      if (channel > this.numChannels())
          return undefined;

      var samples = [];

      for (var i = 0; i < length; i++) {

        var sum = 0;
        for (var j = 0; j < resolution; j++) {

          var cue = index + i * resolution + j;
          sum += this.getSample(cue, channel);

        }

        samples[i] = sum / resolution;

      }

      return samples;

    }

  };



  //
  // Helpers.
  //



  // Converts a word into an integer.
  jWav.wordToInt = function(word, endian) {

    endian = typeof endian === 'undefined' ? 'little' : endian;

    if (endian == 'big')
        word = word.reverse();

    var hex = '';
    for (var i = 0; word[i] != undefined; i++) {
      var b = word[i].toString(16);
      hex += b.length == 1 ? '0' + b : b;   // Must pad single digit hex values.
    }

    return parseInt(hex, 16);

  };


  // Converts a word into a string.
  jWav.wordToString = function(b, endian) {

    endian = typeof endian === 'undefined' ? 'big' : endian;

    if (endian == 'little')
        b = b.reverse();

    var str = '';
    for (var i = 0; b[i] != undefined; i++)
        str += String.fromCharCode(b[i]);

    return str;

  };


  jWav.wordToFloat = function(b, endian) {

    endian = typeof endian === 'undefined' ? 'little' : endian;

    if (endian == 'big')
      word = word.reverse();

    var hex = '';
    for (var i = 0; word[i] != undefined; i++) {
      var b = word[i].toString(16);
      hex += b.length == 1 ? '0' + b : b;   // Must pad single digit hex values.
    }

    return parseInt(hex, 16);

  }



  // Bind the jwav class to the window.
  window.jWav = jWav;

})(window);

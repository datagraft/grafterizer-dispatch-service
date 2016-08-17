'use strict';
/*global module:false*/
module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    // Task configuration.
    jshint: {
      options: {
         jshintrc: '.jshintrc',
	 reporter: require('jshint-stylish')
      },
	all: {
	src: [
      		'*.js'
	     ]
      },
      lib_test: {
        src: ['lib/**/*.js', 'test/**/*.js']
      }
    },
    jscs: {
      options: {
        fix: false
      },
      all: {
        src: ['*.js'],
      }
     }
  });

  // These plugins provide necessary tasks.
  grunt.loadNpmTasks('grunt-concurrent');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-jscs');
  grunt.loadNpmTasks('grunt-mocha');
  grunt.loadNpmTasks('grunt-newer');

  grunt.registerTask('test', [
      'jscs:all',
      'jshint:all'
  ]);

};

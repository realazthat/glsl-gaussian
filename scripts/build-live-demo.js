
var builder = require('./build-a-demo.js');

const BUILDDIR = './www/glsl-gaussian-live-demo/';
const MAINJSFILE = 'glsl-gaussian-live-demo.js';
const MAINHTMLFILE = 'index.html';
const TITLE = 'glsl-gaussian Live Demo';

builder.buildADemo({BUILDDIR, MAINJSFILE, MAINHTMLFILE, TITLE});

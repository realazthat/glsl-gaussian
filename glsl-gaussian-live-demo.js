
const nunjucks = require('nunjucks');
const $ = require('jquery-browserify');
const resl = require('resl');
const regl = require('regl')({
  extensions: ['OES_texture_float'],
  // TODO: FIXME: dunno why we need this here, we do not read non-uint8 data from screen,
  // but it fails without this on gh-pages for some reason.
  attributes: {preserveDrawingBuffer: true},
  profile: true
});

const gaussian = require('./glsl-gaussian.js');
const quad = require('glsl-quad');
var μs = require('microseconds');

resl({
  manifest: {
    texture: {
      type: 'image',
      src: 'assets/Storm Cell Over the Southern Appalachian Mountains-dsc_2303_0-256x256.png',
      parser: (data) => regl.texture({
        data: data,
        mag: 'nearest',
        min: 'nearest',
        flipY: true
      })
    }
  },
  onDone: ({texture}) => {
    // make a bunch of fbos for ping-ponging intermediate computations, and the output buffer etc.
    let fbos = [null, null, null, null].map(function () {
      return regl.framebuffer({
        color: regl.texture({
          width: texture.width,
          height: texture.height,
          stencil: false,
          format: 'rgba',
          type: 'float',
          depth: false,
          wrap: 'clamp',
          mag: 'nearest',
          min: 'nearest'
        }),
        stencil: false,
        depth: false,
        depthStencil: false,
        wrap: 'clamp',
        mag: 'nearest',
        min: 'nearest'
      });
    });

    // use one FBO for the output.
    let outFbo = fbos.pop();

    let draw = regl({
      frag: quad.shader.frag,
      vert: quad.shader.vert,
      attributes: {
        a_position: quad.verts,
        a_uv: quad.uvs
      },
      elements: quad.indices,
      uniforms: {
        u_tex: regl.prop('texture'),
        u_clip_y: +1
      },
      viewport: {
        x: regl.prop('x'),
        y: 0,
        width: texture.width,
        height: texture.height
      }
    });

    let maxRadius = Math.max(texture.width, texture.height);

    $('canvas').css('z-index', '-10');
    let $page = $('<div class="page">')
      .css('z-index', '10')
      .css('background-color', '#49A259')
      .css('color', '#CBCE92')
      .appendTo($('body'));

    let $controlsDiv = $('<div/>').appendTo($page);

    let template = `
    <table class="controls">
      <tr>
      </tr>
      <tr>
        <td>Radius</td>
        <td><input id="radius-control" type="range" min="0" max="${maxRadius}" value="1"/></td>
        <td><span id="radius-view"/></td>
      </tr>
      <tr>
        <td>FPS (approximate rolling average)</td>
        <td></td>
        <td><span id="fps-view"/></td>
      </tr>
    </table>
    `;

    $controlsDiv.html(nunjucks.renderString(template));

    // -------------------------------------------------------------------------

    let $radiusControl = $('#radius-control');
    let $radiusView = $('#radius-view');
    $radiusView.text($radiusControl.val());

    // -------------------------------------------------------------------------

    let $FPSView = $('#fps-view');
    $FPSView.text('0');
    // -------------------------------------------------------------------------

    function approxRollingAverage (avg, newSample, N) {
      // from http://stackoverflow.com/a/16757630/586784
      avg -= avg / N;
      avg += newSample / N;

      return avg;
    }

    let rollingFPSAvg = 0;
    let rollingFPSAvgN = 20;

    regl.frame(function ({viewportWidth, viewportHeight}) {
      let radius = parseInt($radiusControl.val());

      let tt0 = μs.now();
      gaussian.blur.gaussian.compute({regl, texture, radius, fbos, outFbo, components: 'rgb', type: 'vec3'});

      let deltaSeconds = μs.since(tt0) / 1000000;

      rollingFPSAvg = approxRollingAverage(rollingFPSAvg, 1 / deltaSeconds, rollingFPSAvgN);

      regl.clear({
        color: [0, 0, 0, 1],
        depth: 1,
        stencil: 0
      });

      let x = viewportWidth / 2.0 - texture.width;
      draw({texture: texture, x: x});

      x += texture.width;
      draw({texture: outFbo.color[0], x: x});

      // -----------------------------------------------------------------------
      $radiusView.text('' + radius);
      $FPSView.text('' + rollingFPSAvg.toFixed(2));
    });
  }
});

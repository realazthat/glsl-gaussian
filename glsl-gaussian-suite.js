
const nunjucks = require('nunjucks');
const $ = require('jquery-browserify');
const resl = require('resl');
const regl = require('regl')({
  extensions: ['OES_texture_float', 'EXT_disjoint_timer_query', 'EXT_shader_texture_lod'],
  // TODO: FIXME: dunno why we need this here, we do not read non-uint8 data from screen,
  // but it fails without this on gh-pages for some reason.
  attributes: {preserveDrawingBuffer: true},
  profile: true
});

const gaussian = require('./glsl-gaussian.js');
const quad = require('glsl-quad');
// const μs = require('microseconds');


const range = require('array-range');



// command to copy a texture to an FBO, but flipping the Y axis so that the uvs begin
// at the upper right corner, so that it can be drawn to canvas etc.
const drawToCanvasFBO = regl({
  frag: quad.shader.frag,
  vert: quad.shader.vert,
  attributes: {
    a_position: quad.verts,
    a_uv: quad.uvs
  },
  elements: quad.indices,
  uniforms: {
    u_tex: regl.prop('texture'),
    u_clip_y: -1
  },
  framebuffer: regl.prop('fbo')
});

function dataURIFromFBO ({fbo, x = 0, y = 0, width, height, regl}) {
  let canvasFBO = regl.framebuffer({
    color: regl.texture({
      width: width,
      height: height,
      stencil: false,
      format: 'rgba',
      type: 'uint8',
      depth: false,
      wrap: 'clamp',
      mag: 'nearest',
      min: 'nearest'
    })
  });

  let data = [];
  try {
    drawToCanvasFBO({texture: fbo.color[0], fbo: canvasFBO});

    regl({framebuffer: canvasFBO})(function () {
      data = regl.read({x, y, width, height});
    });
  } finally {
    canvasFBO.destroy();
  }

  let canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  let context = canvas.getContext('2d');

  // Copy the pixels to a 2D canvas
  let imageData = context.createImageData(width, height);
  imageData.data.set(data);
  context.putImageData(imageData, 0, 0);

  return canvas.toDataURL();
}

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
    $('canvas').css('z-index', '-10').css('visibility', 'hidden');

    let $page = $('<div class="page">')
      .css('z-index', '10')
      .css('background-color', '#49A259')
      .css('color', '#CBCE92')
      .appendTo($('body'));

    let $pageDiv = $('<div/>').appendTo($page);

    let template = `
    <table class="report">
      <thead>
        <tr>
          <th>
            level
          </th>
          <th>
            Gaussian Stack
          </th>
          <th>
            Gaussian Mipmap (fullscale, {{subsampleStrategy}} subsampling)
          </th>
          <th>
            Gaussian Mipmap (halfscale, {{subsampleStrategy}} subsampling)
          </th>
          <th>
            GPU Mipmap
          </th>
        </tr>
        </thead>
      <tbody>
      {% for level in range(L+1) %}
        <tr>
          <td>
            {{level}}
          </td>
          <td>
            <figure>
              <img src="{{stack[level]}}" />
              <figcaption
                Gaussian stack level,
                <code>level={{level}}</code>,
                <code>size={{ M.x }}X{{ M.y }}</code>
              </figcaption>
            </figure>
          </td>
          <td>
            <figure>
              <img src="{{mipmapFullScale[level]}}" />
              <figcaption>
                Mipmap level,
                <code>level={{level}}</code>,
                <code>size={{scaleSizes[level].x}}X{{scaleSizes[level].y}}</code>
              </figcaption>
            </figure>
          </td>
          <td>
            <figure>
              <img src="{{mipmapHalfScale[level]}}" />
              <figcaption>
                Recursive mipmap level,
                <code>level={{level}}</code>,
                <code>size={{scaleSizes[level].x}}X{{scaleSizes[level].y}}</code>
              </figcaption>
            </figure>
          </td>
          <td>
            <figure>
              <img src="{{gpuMipmap[level]}}" />
              <figcaption>
                GPU mipmap level,
                <code>level={{level}}</code>,
                <code>size={{scaleSizes[level].x}}X{{scaleSizes[level].y}}</code>
              </figcaption>
            </figure>
          </td>
        </tr>
      {% endfor %}
      </tbody>
    </table>
    `;

    let gaussianFbos = range(2).map(function () {
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

    function makeUint8Fbo ({width, height}) {
      return regl.framebuffer({
        color: regl.texture({
          width: width,
          height: height,
          stencil: false,
          format: 'rgba',
          type: 'uint8',
          depth: false,
          wrap: 'clamp',
          mag: 'linear',
          min: 'linear'
        }),
        width: width,
        height: height,
        depth: false,
        stencil: false,
        depthStencil: false,
        depthTexture: false,
        colorType: 'uint8',
        colorFormat: 'rgba'
      });
    }

    let components = 'rgba';
    let type = 'vec4';
    let subsampleStrategy = 'lower-left';

    let L = Math.max(Math.ceil(Math.log2(texture.width)), Math.ceil(Math.log2(texture.height)));
    let [width, height] = [texture.width, texture.height];

    let inFbo = regl.framebuffer({
      color: texture,
      width: width,
      height: height,
      depth: false,
      stencil: false,
      depthStencil: false,
      depthTexture: false,
      colorType: 'uint8',
      colorFormat: 'rgba'
    });

    let outFbo = makeUint8Fbo({width, height});
    let scaledFbos = range(L + 1).map(function (level) {
      // level 1 should have a mipmap size of 2^(L-1)
      // level 2 should have a mipmap size of 2^(L-2)
      let mipmapSize = 1 << (L - level);

      return makeUint8Fbo({width: mipmapSize, height: mipmapSize});
    });

    let stack = [];
    let mipmapFullScale = [];
    let mipmapHalfScale = [];

    // add the full scale image to the image sequences.
    stack.push(dataURIFromFBO({fbo: inFbo, width, height, regl}));
    mipmapFullScale.push(dataURIFromFBO({fbo: inFbo, width, height, regl}));
    mipmapHalfScale.push(dataURIFromFBO({fbo: inFbo, width, height, regl}));

    for (let level = 1; level < L + 1; ++level) {
      // level 1 should have a radius of 1
      // level 2 should have a radius of 2
      // level 3 should have a radius of 4
      let radius = 1 << (level - 1);
      // level 1 should have a mipmap size of 2^(L-1)
      // level 2 should have a mipmap size of 2^(L-2)
      let mipmapSize = 1 << (L - level);
      gaussian.blur.gaussian.compute({regl, texture, radius, fbos: gaussianFbos, outFbo, components, type});
      stack.push(dataURIFromFBO({fbo: outFbo, width, height, regl}));

      // let outViewport = {x: 0, y: 0, width: mipmapSize, height: mipmapSize};
      let sampleSize = {x: radius * 2, y: radius * 2};
      console.log('sampleSize:', sampleSize);
      console.log('mipmapSize:', mipmapSize);
      let scaledFbo = scaledFbos[level];
      gaussian.subsample({regl,
                          texture: outFbo.color[0],
                          resolution: {x: 1 << L, y: 1 << L},
                          sampleSize,
                          strategy: subsampleStrategy,
                          outFbo: scaledFbo,
                          // outViewport: outViewport,
                          components, type});
      mipmapFullScale.push(dataURIFromFBO({fbo: scaledFbo, width: mipmapSize, height: mipmapSize, regl}));
    }

    let scaleSizes = range(L + 1).map((level) => ({x: 1 << (L - level), y: 1 << (L - level)}));

    /*
    for (let level = 1; level < L; ++level) {
      // level 1 should have a mipmap size of 2^(L-1)
      // level 2 should have a mipmap size of 2^(L-2)
      let mipmapSize = 1 << (L - level);
      let currentTexture = (level == 0) ? texture : scaledFbos[level - 1];

      let outFbo = scaledFbos[level];

      // halfscale of the previous mipmap level.
      gaussian.blur.gaussian.compute({regl, texture, radius: 1, fbos: gaussianFbos, outFbo, components, type});

      let outViewport = {x: 0, y: 0, width: texture.width / 2*(1 << (L - k)), height: texture.height / 2*(1 << (L - k))};
      gaussian.subsample({regl,
                          texture: outFbo.color[0],
                          resolution: {x: texture.width, y: texture.height},
                          sampleSize: {x: radius * 2, y: radius * 2},
                          strategy: subsampleStrategy,
                          outFbo: {fbo: scaledFbo, outViewport},
                          components, type});
      mipmapHalfScale.push(dataURIFromFBO(fbo: scaledFbo, outViewport.width, outViewport.height, regl));

    }
    */

    let M = {x: (1 << L), y: (1 << L)};

    let templateParams = {L, M, subsampleStrategy, scaleSizes, stack, mipmapHalfScale, mipmapFullScale};
    $pageDiv.html(nunjucks.renderString(template, templateParams));
  }
});

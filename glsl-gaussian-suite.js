
const range = require('array-range');
const nunjucks = require('nunjucks');
const $ = require('jquery-browserify');
const resl = require('resl');
const regl = require('regl')({
  extensions: ['OES_texture_float'],
  optionalExtensions: ['EXT_disjoint_timer_query'],
  // TODO: FIXME: dunno why we need this here, we do not read non-uint8 data from screen,
  // but it fails without this on gh-pages for some reason.
  attributes: {preserveDrawingBuffer: true},
  profile: true
});

const gaussian = require('./glsl-gaussian.js');
const quad = require('glsl-quad');
// const μs = require('microseconds');

function extractNN ({regl, texture,
                          outFbo, outViewport = null,
                          components = 'rgba', type = 'vec4'}) {
  let frag = `
    precision highp float;

    varying vec2 v_uv;
    uniform sampler2D u_tex;

    void main () {
      ${type} result = texture2D(u_tex, v_uv).${components};

      gl_FragColor.${components} = result;
      gl_FragColor.a = 1.0;
    }
  `;
  let params = {
    vert: quad.shader.vert,
    frag: frag,
    attributes: {
      a_position: quad.verts,
      a_uv: quad.uvs
    },
    elements: quad.indices,
    uniforms: {
      u_tex: regl.prop('texture'),
      u_clip_y: 1
    },
    framebuffer: regl.prop('fbo')
  };

  const draw = regl(params);

  params.viewport = regl.prop('viewport');
  const drawToViewport = regl(params);

  if (outViewport !== null && outViewport !== undefined) {
    drawToViewport({texture, fbo: outFbo, outViewport});
  } else {
    draw({texture, fbo: outFbo});
  }
}

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
    textures: {
      type: 'image',
      src: 'assets/Storm Cell Over the Southern Appalachian Mountains-dsc_2303_0-256x256.png',
      parser: (data) => [
        regl.texture({
          data: data,
          mag: 'nearest',
          min: 'nearest',
          flipY: true
        }),
        regl.texture({
          data: data,
          mag: 'nearest',
          min: 'mipmap',
          flipY: true,
          mipmap: 'nice'
        })
      ]
    }
  },
  onDone: ({textures}) => {
    let [texture, mippedTexture] = textures;
    $('canvas').css('z-index', '-10').css('visibility', 'hidden');

    let $page = $('<div class="page">')
      .css('z-index', '10')
      .css('color', '#CBCE92')
      .appendTo($('body'));

    let $pageDiv = $('<div/>').appendTo($page);

    let template = `
    <table class="report">
      <thead>
        <tr>
          <th>
            *
          </th>
          {% for level in range(L+1) %}
          <th>
            level={{level}}
          </th>
          {% endfor %}
        </tr>
      </thead>
      <tbody>
      {% for row in range(sequences.length) %}
      {% for upscaled in [false, true] %}
      <tr>
        <th>
          {{sequences[row].name}}
          <br/>
          {% if upscaled %}
          upscaled to {{M.x}}X{{M.y}}
          {% endif %}
        </th>
        {% for level in range(L+1) %}
        <td>
          <figure>
            <img src="{{sequences[row].sequence[level]}}"
              class="nearest-neighbor"
              {% if upscaled %}
              style="width: {{M.x}}px; height: {{M.y}}px;"
              {% endif %}
               />
            <figcaption>
              {{sequences[row].name}}
              <br/>
              <code>level={{level}}</code>,
              <br/>
              <code>
                size={{sequences[row].sizes[level].x}}X{{sequences[row].sizes[level].y}}
                {% if upscaled %}
                upscaled to {{M.x}}X{{M.y}}
                {% endif %}
              </code>
            </figcaption>
          </figure>
        </td>
        {% endfor %}
      </tr>
      {% endfor %}
      {% endfor %}
      </tbody>
    </table>
    `;

    let gaussianFbos = range(2).map(function () {
      return regl.framebuffer({
        color: regl.texture({
          width: texture.width,
          height: texture.height,
          format: 'rgba',
          type: 'float',
          depth: false,
          stencil: false,
          wrap: 'clamp',
          mag: 'nearest',
          min: 'nearest'
        }),
        depth: false,
        stencil: false,
        depthStencil: false,
        depthTexture: false,
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
      let miplevelSize = 1 << (L - level);

      return makeUint8Fbo({width: miplevelSize, height: miplevelSize});
    });

    let stack = [];
    let mipmapFullScale = [];
    let mipmapHalfScale = [];
    let gpuMipmap = [];
    let nnScaled = [];

    // add the full scale image to the image sequences.
    stack.push(dataURIFromFBO({fbo: inFbo, width, height, regl}));
    mipmapFullScale.push(dataURIFromFBO({fbo: inFbo, width, height, regl}));
    mipmapHalfScale.push(dataURIFromFBO({fbo: inFbo, width, height, regl}));
    gpuMipmap.push(dataURIFromFBO({fbo: inFbo, width, height, regl}));
    nnScaled.push(dataURIFromFBO({fbo: inFbo, width, height, regl}));

    for (let level = 1; level < L + 1; ++level) {
      // level 1 should have a radius of 1
      // level 2 should have a radius of 2
      // level 3 should have a radius of 4
      let radius = 1 << (level - 1);
      // level 1 should have a mipmap size of 2^(L-1)
      // level 2 should have a mipmap size of 2^(L-2)
      let miplevelSize = 1 << (L - level);
      gaussian.blur.gaussian.compute({regl, texture, radius, fbos: gaussianFbos, outFbo, components, type});
      stack.push(dataURIFromFBO({fbo: outFbo, width, height, regl}));

      // let outViewport = {x: 0, y: 0, width: miplevelSize, height: miplevelSize};
      let sampleSize = {x: radius * 2, y: radius * 2};
      console.log('sampleSize:', sampleSize);
      console.log('miplevelSize:', miplevelSize);
      let scaledFbo = scaledFbos[level];
      gaussian.subsample({regl,
                          texture: outFbo.color[0],
                          resolution: {x: 1 << L, y: 1 << L},
                          sampleSize,
                          strategy: subsampleStrategy,
                          outFbo: scaledFbo,
                          // outViewport: outViewport,
                          components, type});
      mipmapFullScale.push(dataURIFromFBO({fbo: scaledFbo, width: miplevelSize, height: miplevelSize, regl}));
    }

    for (let level = 1; level < L + 1; ++level) {
      // level 1 should have a mipmap size of 2^(L-1)
      // level 2 should have a mipmap size of 2^(L-2)
      let miplevelSize = 1 << (L - level);

      let scaledFbo = scaledFbos[level];

      // here we extract NN to an FBO that is smaller and smaller, so that each pixel covers a larger
      // area, activating the LOD; the mippedTexture has mipmap LOD turned on, and scaledFbo is
      // an appropriately sized FBO with very large pixels (i.e very view pixels, each covering a larger area
      // of the input texture)
      extractNN({regl, texture: mippedTexture,
                          outFbo: scaledFbo,
                          components, type});

      gpuMipmap.push(dataURIFromFBO({fbo: scaledFbo, width: miplevelSize, height: miplevelSize, regl}));

      // here we extract the NN to an FBO that is smaller and smaller BUT, there are no mipmaps
      // so it is forced to take the center of the input pixel as the resulting value.
      extractNN({ regl, texture: texture,
                  outFbo: scaledFbo,
                  components, type});
      nnScaled.push(dataURIFromFBO({fbo: scaledFbo, width: miplevelSize, height: miplevelSize, regl}));
    }

    let M = {x: (1 << L), y: (1 << L)};
    let scaleSizes = range(L + 1).map((level) => ({x: 1 << (L - level), y: 1 << (L - level)}));

    let sequences = [];
    sequences.push({
      sequence: stack,
      sizes: range(L + 1).map(() => ({x: 1 << L, y: 1 << L})),
      name: 'Gaussian Stack'
    });
    sequences.push({
      sequence: mipmapFullScale,
      sizes: scaleSizes,
      name: `Gaussian Mipmap (fullscale, ${subsampleStrategy} subsampling)`
    });
    sequences.push({
      sequence: mipmapHalfScale,
      sizes: scaleSizes,
      name: `Recursive Gaussian Mipmap (halfscale, ${subsampleStrategy} subsampling)`
    });
    sequences.push({
      sequence: gpuMipmap,
      sizes: scaleSizes,
      name: 'GPU Mipmap'
    });
    sequences.push({
      sequence: nnScaled,
      sizes: scaleSizes,
      name: 'Nearest Neighbor Scaled'
    });

    let templateParams = {
      L, M, subsampleStrategy,
      // scaleSizes,
      // stack,
      // mipmapHalfScale,
      // mipmapFullScale,
      // gpuMipmap,
      sequences
    };

    $pageDiv.html(nunjucks.renderString(template, templateParams));
  }
});

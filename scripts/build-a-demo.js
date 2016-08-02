
const fs = require('fs');
const mkdirp = require('mkdirp');
const ncp = require('ncp');
const browserify = require('browserify');

function buildADemo ({BUILDDIR, MAINJSFILE, MAINHTMLFILE, TITLE}) {
  const HTMLCONTENT = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${TITLE}</title>
    <!--[if IE]>
      <script src="http://html5shiv.googlecode.com/svn/trunk/html5.js"></script>
    <![endif]-->
  </head>
  <body>

  <script src="./${MAINJSFILE}"></script>
  </body>
  </html>
  `;

  mkdirp(BUILDDIR, function (err) {
    if (err) {
      throw err;
    }
    ncp('assets', `${BUILDDIR}/assets`, function (err) {
      if (err) {
        throw err;
      }
    });

    let b = browserify({debug: true});
    b.add(MAINJSFILE);
    b.bundle(function (err, bundle) {
      if (err) {
        throw err;
      }
      console.log('bundled', MAINJSFILE);

      fs.writeFile(`${BUILDDIR}/${MAINJSFILE}`, bundle, function (err) {
        if (err) {
          throw err;
        }
      });
    });

    fs.writeFile(`${BUILDDIR}/${MAINHTMLFILE}`, HTMLCONTENT, function (err) {
      if (err) {
        throw err;
      }
    });
  });
}

module.exports = {buildADemo};

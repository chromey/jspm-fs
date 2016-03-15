"use strict";

if (typeof Map !== 'function') throw new Error('Package "jspm-fs" requires ES6 language features');

const path = require('path');
const fs = require('graceful-fs');
const semver = require('semver');
const unzip = require('unzip');
const utils = require('./lib/utils');

// Constants
const BASEDIR_ENV_NAME = 'JSPM_REGISTRY_FS_BASEDIR';

class FilesystemLocationError extends Error {}

class FilesystemLocator {

  /**
   *
   * @param {object} config
   * @param {object} ui
   * @returns {Promise}
   */
  static configure(config, ui) {
    return ui.input(
      'Enter absolute directory path to where your package release files reside: ',
      config.baseDir || process.env[BASEDIR_ENV_NAME]
    ).then(baseDir => config.baseDir = baseDir);
  }

  constructor(options, ui) {
    this._ui = ui;
    this.versionString = options.versionString + '.1';

    console.log(options.apiVersion);
    
    if (!semver.satisfies(options.apiVersion, '>=1.7')) {
      throw new FilesystemLocatiorError('Current jspm-fs version isn\'t compatible to the jspm Endpoint API v' + options.apiVersion + '\n' +
      'Please update or install a compatible version of jspm-fs.');
    }

    // Determine base directory used to resolve symbolic package names
    this._baseDir = path.resolve(options.baseDir || process.env[BASEDIR_ENV_NAME] || '');
    if (!utils.isDirectory(this._baseDir)) {
      throw new FilesystemLocator(
        `Environment variable ${BASEDIR_ENV_NAME} doesn't point to a valid registry base directory: "${this._baseDir}"`);
    }
  }

  /**
   * Locate given package name
   * @param {string} packageName
   * @returns {Promise}
   */
  locate(packageName) {
    // TODO: Add support for absolute file paths (when pkgName doesn't begin with alphanum char)
    const expectedSourceDir = path.resolve(path.join(this._baseDir, packageName));
    if (!expectedSourceDir.startsWith(this._baseDir)) {
      const error = new FilesystemLocationError('FilesystemLocator: Invalid package name! Package name must not contain relative path fragments');
      error.config = true;
      return Promise.reject(error);
    }

    if (!utils.isDirectory(expectedSourceDir))
      return Promise.resolve({ notfound: true });
  }

  /**
   * Lookup given package and return map of available versions
   * 
   * @param {string} packageName
   * @returns {Promise}
   */
  lookup(packageName) {
    let result = { notfound: true };
    const pkgFilenamePattern = new RegExp(`^${packageName}-([\\d\\.]+|latest|beta)\\.zip$`, 'i');

    // TODO: Add support for absolute file paths (when pkgName doesn't begin with alphanum char)
    const expectedSourceDir = path.resolve(path.join(this._baseDir, packageName));
    if (!expectedSourceDir.startsWith(this._baseDir)) {
      const error = new FilesystemLocationError('FilesystemLocator: Invalid package name! Package name must not contain relative path fragments');
      error.config = true;
      return Promise.reject(error);
    }

    if (utils.isDirectory(expectedSourceDir)) {
      let versions = {};
      utils.listDir(expectedSourceDir, 'file')
        .forEach(entry => {
          const filename = path.basename(entry.path);
          const filenameFrags = filename.match(pkgFilenamePattern);
          if (filenameFrags) {
            versions[filenameFrags[1]] = {
              hash: entry.path + '#' + entry.stat.mtime.getTime(),
              stable: semver.valid(filenameFrags[1]) !== null
            };
          }
        });
      result = { versions: versions };
    }

    return Promise.resolve(result);
  }

  /**
   * Download package into local directory
   * @param {string} packageName
   * @param {string} version
   * @param {string} hash
   * @param {string?} meta
   * @param {string} dir
   * @returns {Promise} Package.json object
   */
  download(packageName, version, hash, meta, dir) {
    // TODO: Add support for absolute file paths (when pkgName doesn't begin with alphanum char)
    const expectedSourceDir = path.resolve(path.join(this._baseDir, packageName));
    if (!expectedSourceDir.startsWith(this._baseDir)) {
      const error = new FilesystemLocationError('FilesystemLocator: Invalid package name! Package name must not contain relative path fragments');
      error.config = true;
      return Promise.reject(error);
    }

    const pkgFile = path.join(expectedSourceDir, `${packageName}-${version}.zip`);
    return new Promise(function(resolve, reject) {
      try {
        fs.accessSync(pkgFile, fs.F_OK | fs.R_OK)
      } catch (exc) {
        return reject('Local package zip file could not be accessed: ' +  pkgFile + '. Make sure the file exists and is accessible by the current user.');
      }

      fs.createReadStream(pkgFile).pipe(
        unzip.Extract({ path: dir })
        .on('error', reject)
        .on('close', () => {
          try {
            const pkgJson = utils.loadJsonFile(path.join(dir, 'package.json'));
            resolve(pkgJson);
          } catch (exc) {
            reject(exc);
          }
        })
      );
    });
  }

}

Object.defineProperty(FilesystemLocator, 'packageFormat', {
  value: /^fs:([^@\/]+(@[^\/]+)?(\/.+)?)$/i,
  enumerable: true
});

// Exports
module.exports = FilesystemLocator;

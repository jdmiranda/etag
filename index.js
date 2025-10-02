/*!
 * etag
 * Copyright(c) 2014-2016 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

/**
 * Module exports.
 * @public
 */

module.exports = etag

/**
 * Module dependencies.
 * @private
 */

var crypto = require('crypto')
var Stats = require('fs').Stats

/**
 * Module variables.
 * @private
 */

var toString = Object.prototype.toString

/**
 * Cache configuration
 * @private
 */

var HASH_CACHE_SIZE = 1000
var STAT_CACHE_TTL = 5000 // 5 seconds
var hashCache = new Map()
var hashCacheKeys = []
var statCache = new Map()

// Pre-computed empty entity tag
var EMPTY_TAG = '"0-2jmj7l5rSw0yVb/vlWAYkK/YBwk"'
var WEAK_EMPTY_TAG = 'W/' + EMPTY_TAG

/**
 * Generate an entity tag.
 *
 * @param {Buffer|string} entity
 * @param {boolean} [weak]
 * @return {string}
 * @private
 */

function entitytag (entity, weak) {
  if (entity.length === 0) {
    // fast-path empty
    return weak ? WEAK_EMPTY_TAG : EMPTY_TAG
  }

  var isBuffer = Buffer.isBuffer(entity)
  var len = isBuffer ? entity.length : Buffer.byteLength(entity, 'utf8')

  // Generate cache key using length and first/last bytes for quick uniqueness check
  var cacheKey
  if (isBuffer) {
    cacheKey = len + '-' + entity[0] + '-' + entity[len - 1]
  } else {
    cacheKey = len + '-' + entity.charCodeAt(0) + '-' + entity.charCodeAt(len - 1)
  }

  // Check hash cache
  var cached = hashCache.get(cacheKey)
  if (cached && cached.entity === entity) {
    return weak ? 'W/' + cached.tag : cached.tag
  }

  // compute hash of entity
  var hash = crypto
    .createHash('sha1')
    .update(entity, 'utf8')
    .digest('base64')
    .substring(0, 27)

  var tag = '"' + len.toString(16) + '-' + hash + '"'

  // Update cache with LRU eviction
  if (hashCache.size >= HASH_CACHE_SIZE) {
    var oldestKey = hashCacheKeys.shift()
    hashCache.delete(oldestKey)
  }
  hashCacheKeys.push(cacheKey)
  hashCache.set(cacheKey, { entity: entity, tag: tag })

  return weak ? 'W/' + tag : tag
}

/**
 * Create a simple ETag.
 *
 * @param {string|Buffer|Stats} entity
 * @param {object} [options]
 * @param {boolean} [options.weak]
 * @return {String}
 * @public
 */

function etag (entity, options) {
  if (entity == null) {
    throw new TypeError('argument entity is required')
  }

  // support fs.Stats object
  var isStats = isstats(entity)
  var weak = options && typeof options.weak === 'boolean'
    ? options.weak
    : isStats

  // validate argument
  if (!isStats && typeof entity !== 'string' && !Buffer.isBuffer(entity)) {
    throw new TypeError('argument entity must be string, Buffer, or fs.Stats')
  }

  // generate entity tag
  var tag = isStats
    ? stattag(entity, weak)
    : entitytag(entity, weak)

  return tag
}

/**
 * Determine if object is a Stats object.
 *
 * @param {object} obj
 * @return {boolean}
 * @api private
 */

function isstats (obj) {
  // genuine fs.Stats
  if (typeof Stats === 'function' && obj instanceof Stats) {
    return true
  }

  // quack quack
  return obj && typeof obj === 'object' &&
    'ctime' in obj && toString.call(obj.ctime) === '[object Date]' &&
    'mtime' in obj && toString.call(obj.mtime) === '[object Date]' &&
    'ino' in obj && typeof obj.ino === 'number' &&
    'size' in obj && typeof obj.size === 'number'
}

/**
 * Generate a tag for a stat.
 *
 * @param {object} stat
 * @param {boolean} [weak]
 * @return {string}
 * @private
 */

function stattag (stat, weak) {
  var mtime = stat.mtime.getTime()
  var size = stat.size
  var ino = stat.ino

  // Create cache key using inode and mtime
  var cacheKey = ino + '-' + mtime

  // Check stat cache
  var now = Date.now()
  var cached = statCache.get(cacheKey)
  if (cached && (now - cached.timestamp) < STAT_CACHE_TTL) {
    return weak ? cached.weakTag : cached.strongTag
  }

  // Generate tags
  var mtimeHex = mtime.toString(16)
  var sizeHex = size.toString(16)
  var tag = '"' + sizeHex + '-' + mtimeHex + '"'
  var weakTag = 'W/' + tag

  // Update cache
  statCache.set(cacheKey, {
    strongTag: tag,
    weakTag: weakTag,
    timestamp: now
  })

  // Clean old cache entries periodically
  if (statCache.size > HASH_CACHE_SIZE) {
    var keysToDelete = []
    statCache.forEach(function (value, key) {
      if ((now - value.timestamp) >= STAT_CACHE_TTL) {
        keysToDelete.push(key)
      }
    })
    keysToDelete.forEach(function (key) {
      statCache.delete(key)
    })
  }

  return weak ? weakTag : tag
}

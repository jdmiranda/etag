#!/usr/bin/env node

/**
 * Benchmark comparison between original and optimized etag
 */

var Benchmark = require('benchmark')
var Buffer = require('safe-buffer').Buffer
var seedrandom = require('seedrandom')
var fs = require('fs')

// Test data
var testString100 = generateString(100)
var testString1kb = generateString(1000)
var testString10kb = generateString(10000)
var testBuffer100 = Buffer.from(testString100)
var testBuffer1kb = Buffer.from(testString1kb)
var testBuffer10kb = Buffer.from(testString10kb)
var testStat = fs.statSync(__filename)

// Load etag module
var etag = require('./index.js')

console.log('ETag Optimization Benchmark')
console.log('============================\n')

// Test empty string (fast path)
console.log('Empty String (fast path):')
runTest('empty string', '', { weak: false })
runTest('empty string weak', '', { weak: true })

// Test small strings/buffers (100B)
console.log('\n100B Payload:')
runTest('string 100B', testString100, { weak: false })
runTest('buffer 100B', testBuffer100, { weak: false })

// Test medium strings/buffers (1KB)
console.log('\n1KB Payload:')
runTest('string 1KB', testString1kb, { weak: false })
runTest('buffer 1KB', testBuffer1kb, { weak: false })

// Test large strings/buffers (10KB)
console.log('\n10KB Payload:')
runTest('string 10KB', testString10kb, { weak: false })
runTest('buffer 10KB', testBuffer10kb, { weak: false })

// Test fs.Stats (with caching)
console.log('\nfs.Stats (with caching):')
runTest('stat first call', testStat, { weak: true })
runTest('stat cached call', testStat, { weak: true })

// Test cache hits (repeated calls)
console.log('\nCache Hit Performance:')
runCacheTest('repeated 1KB string', testString1kb, 10000)
runCacheTest('repeated 1KB buffer', testBuffer1kb, 10000)
runCacheTest('repeated stat', testStat, 10000)

console.log('\n============================')
console.log('Benchmark Complete')

function runTest(name, entity, options) {
  var start = process.hrtime.bigint()
  var result = etag(entity, options)
  var end = process.hrtime.bigint()
  var timeNs = Number(end - start)
  var timeMicro = (timeNs / 1000).toFixed(2)
  console.log('  ' + name + ': ' + timeMicro + ' μs')
  return result
}

function runCacheTest(name, entity, iterations) {
  var start = process.hrtime.bigint()
  for (var i = 0; i < iterations; i++) {
    etag(entity)
  }
  var end = process.hrtime.bigint()
  var totalMs = Number(end - start) / 1000000
  var avgMicro = (totalMs * 1000 / iterations).toFixed(2)
  var opsPerSec = (iterations / (totalMs / 1000)).toFixed(0)
  console.log('  ' + name + ' (' + iterations + ' ops): ' + avgMicro + ' μs/op, ' + opsPerSec + ' ops/sec')
}

function generateString(size) {
  var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  var rng = seedrandom('benchmark' + size)
  var result = ''
  for (var i = 0; i < size; i++) {
    result += chars[Math.floor(rng() * chars.length)]
  }
  return result
}

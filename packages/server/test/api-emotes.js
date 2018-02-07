const { test } = require('ava')
const { testWithServer, makeAdmin } = require('./_serverUtil')
const fetch = require('./_fetch')
const nodeFetch = require('node-fetch')

let portForApiEmoteTests = 27000

test('POST /api/emotes', t => {
  return testWithServer(portForApiEmoteTests++, async ({ server, port }) => {
    const { sessionID } = await makeAdmin(server, port)
    t.is(await server.db.emotes.count({}), 0)
    await fetch(port, '/emotes', {
      method: 'POST',
      body: JSON.stringify({
        shortcode: 'shipit',
        imageURL: '/img/shipit.png',
        sessionID
      })
    })
    t.is(await server.db.emotes.count({}), 1)
  })
})

test('GET /api/emotes', t => {
  return testWithServer(portForApiEmoteTests++, async ({ server, port }) => {
    const { sessionID } = await makeAdmin(server, port)
    for (let i = 0; i < 2; i++) {
      await fetch(port, '/emotes', {
        method: 'POST',
        body: JSON.stringify({
          shortcode: 'shipit' + i,
          imageURL: '/img/shipit.png',
          sessionID
        })
      })
    }

    const result = await fetch(port, '/emotes')
    t.deepEqual(result, {
      emotes: [
        {shortcode: 'shipit0', imageURL: '/img/shipit.png'},
        {shortcode: 'shipit1', imageURL: '/img/shipit.png'}
      ]
    })
  })
})

test('GET /api/emotes/:shortcode', t => {
  return testWithServer(portForApiEmoteTests++, async ({ server, port }) => {
    const { sessionID } = await makeAdmin(server, port)
    await fetch(port, '/emotes', {
      method: 'POST',
      body: JSON.stringify({
        shortcode: 'shipit',
        imageURL: '/img/shipit.png',
        sessionID
      })
    })
    const response = await nodeFetch(`http://localhost:${port}/api/emotes/shipit`, {
      redirect: 'manual'
    })
    t.is(response.headers.get('location'), `http://localhost:${port}/img/shipit.png`)
  })
})

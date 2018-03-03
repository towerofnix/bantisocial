const fetch = require('./fetch')
const typeforce = require('typeforce')
const { Thing, Things, SET_DATA } = require('./things')

const nextTick = k => setTimeout(k, 0)

const queryString = query => {
  const esc = encodeURIComponent
  return Object.keys(query).length > 0
    ? '?' + Object.keys(query)
      .map(k => esc(k) + '=' + esc(query[k]))
      .join('&')
    : ''
}

const channelType = {
  id: 'String',
  name: 'String',

  unreadMessageCount: '?Number',
  oldestUnreadMessageID: '?String',
}

const messageType = {
  id: 'String',
  channelID: 'String',

  // type: 'String',

  text: 'String',

  authorID: '?String',
  authorUsername: '?String',
  authorAvatarURL: '?String',
  authorFlair: '?String',

  // dateCreated: 'Number',
  // dateEdited: '?Number',
  date: 'Number',
  editDate: '?Number',
}

class Message extends Thing {
  constructor(client, data) {
    super(client, messageType, data)

    this.deleted = false

    this.channel = this.client.channels.find(channel => channel.id === data.channelID)
    this.author = this.client.users.find(user => user.id === data.authorID)

    this.client._socket.on('message/edit', ({ message }) => {
      if (message.id === this.id) {
        this[SET_DATA](message)
        this.emit('edit', this)
      }
    })

    this.client._socket.on('message/delete', ({ messageID }) => {
      if (messageID === this.id) {
        // Oof
        this.deleted = true
        this.emit('delete', this)
      }
    })

    this.client._socket.on('channel/pins/add', ({ message: messageObj }) => {
      if (messageObj.id === this.id) {
        this.emit('pin', this)
      }
    })

    this.client._socket.on('channel/pins/remove', ({ messageID }) => {
      if (messageID == this.id) {
        this.emit('unpin', this)
      }
    })
  }

  async pin() {
    await this.client.fetch('/api/channels/' + this.channel.id + '/pins', {
      method: 'POST',
      body: {messageID: this.id},
    })
  }

  async unpin() {
    await this.client.fetch('/api/channels/' + this.channel.id + '/pins/' + this.id, {
      method: 'DELETE',
    })
  }

  get dateCreated() {
    return new Date(this.date)
  }

  get dateEdited() {
    return this.editDate ? new Date(this.editDate) : null
  }
}

class PinnedMessages extends Things {
  constructor(client, channel) {
    super(client)
    Object.defineProperty(this, 'channel', {value: channel})

    this.client._socket.on('channel/pins/add', ({ message: messageObj }) => {
      if (messageObj.channelID === this.channel.id) {
        const message = new Message(this.client, messageObj)

        this.set.push(message)
        this.emit('pin', message)
      }
    })

    this.client._socket.on('channel/pins/remove', ({ messageID }) => {
      const index = this.set.findIndex(msg => msg.id === messageID)

      if (index < 0) return // Not this channel's pin

      this.emit('unpin', this.set[index])
      this.set.splice(index, 1)
    })
  }

  async load() {
    const { pins } = await this.client.fetch('/api/channels/' + this.channel.id + '/pins')

    return this.set = pins.map(pin => new Message(this.client, pin))
  }
}

class Channel extends Thing {
  constructor(client, data) {
    super(client, channelType, data)

    this.deleted = false

    this.client._socket.on('channel/update', ({ channel }) => {
      if (channel.id === this.id) {
        this[SET_DATA](channel)
        this.emit('update', this)
      }
    })

    this.client._socket.on('channel/delete', ({ channelID }) => {
      if (channelID === this.id) {
        // Oof
        this.deleted = true
        this.emit('delete', this)
      }
    })

    this.client._socket.on('message/new', ({ message: messageObj }) => {
      if (messageObj.channelID === this.id) {
        this.emit('message', new Message(this.client, messageObj))
      }
    })
  }

  async markRead() {
    await this.client.fetch('/api/channels/' + this.channel.id + '/mark-read', {
      method: 'POST',
    })
  }

  async getMessages({ before, after, limit } = {}) {
    typeforce(typeforce.maybe(messageType), before)
    typeforce(typeforce.maybe(messageType), after)
    typeforce('?Number', limit)

    if (Math.floor(limit) !== limit) throw new TypeError('getMessages({ limit }) must be int')
    if (limit < 1 || limit > 50) throw new TypeError('getMessages({ limit }) does not satisfy 1 <= limit <= 50')

    const qs = {}
    if (before) qs.before = before.id
    if (after) qs.after = after.id
    if (limit) qs.limit = limit

    const { messages } = await this.client.fetch('/api/channels/' + this.channel.id + '/messages' + querystring(qs))

    return messages.map(msg => new Message(this.client, msg))
  }

  async getPins() {
    const pins = new PinnedMessages(this.client, this)

    await pins.load()

    return pins
  }

  async sendMessage(text) {
    typeforce('String', text)

    const { messageID } = await this.client.fetch('/api/messages', {
      method: 'POST',
      body: {
        channelID: this.id,
        text,
      },
    })

    return messageID
  }

  toString() {
    return '#' + this.name
  }
}

class Channels extends Things {
  constructor(client) {
    super(client, {t: 'channel', ts: 'channels', T: Channel})

    this.client._socket.on('channel/new', ({ channel: channelObj }) => {
      const channel = new Channel(this.client, channelObj)

      // Add to this.set
      this.set.push(channel)

      // Re-emit event
      this.emit('new', channel)
    })

    this.client._socket.on('channel/delete', ({ channelID }) => {
      const index = this.set.findIndex(chl => chl.id === channelID)

      if (index < 0) return // ???

      // Re-emit event
      this.emit('delete', this.set[index])

      // Remove from set
      this.set.splice(index, 1)
    })

    this.client._socket.on('channel/update', ({ channel }) =>
      nextTick(() => this.emit('update', channel)))

    this.client._socket.on('message/new', ({ message: messageObj }) => {
      this.emit('message', new Message(this.client, messageObj))
    })

    // pin-related events are found under Message(s)
  }
}

module.exports = { Channel, Channels, PinnedMessages, Message, messageType, channelType }

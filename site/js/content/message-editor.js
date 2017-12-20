const html = require('choo/html')
const api = require('../util/api')

module.exports = (state, emit) => {
  const textarea = html`<textarea
    class='message-editor-input'
    placeholder='Enter a message...'>
  </textarea>`

  async function send() {
    const text = textarea.value.trim()

    if (text.length === 0) return
    textarea.value = ''

    await api.post(state.host, 'send-message', {
      text,
      channelID: state.channel.id,
      sessionID: state.sessionID,
    })
  }

  textarea.addEventListener('keydown', evt => {
    const key = evt.which

    // enter
    if (key === 13) {
      if (evt.shiftKey) {
        // if shift is down, enter a newline
        // this is default behaviour
      } else {
        // if shift is not down, send the message
        evt.preventDefault()
        send()
      }
    }
  })

  if (state.sessionID !== null) {
    const editor = html`<div class='message-editor'>
      ${textarea}
      <button class='message-editor-button' onclick=${send}>Send</button>
    </div>`

    // We only want to replace the editor element if it's changed to being
    // logged out (at which point the actual content will have changed, so
    // replacing it is necessary).
    editor.isSameNode = a => {
      return a.classList.contains('logged-out')
    }

    return editor
  } else {
    return html`<div class='message-editor not-logged-in'>
      You must be logged in to send messages
    </div>`
  }
}

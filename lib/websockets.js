const WebSocket = require('ws')
const axios = require('axios')

const Sockets = {}
Sockets.ws = {}
Sockets.heartbeat = {}

getPublicWsToken = async function (baseURL) {
  let endpoint = '/api/v1/bullet-public'
  let url = baseURL + endpoint
  let result = await axios.post(url, {})
  return result.data
}

getPrivateWsToken = async function (baseURL, sign) {
  let endpoint = '/api/v1/bullet-private'
  let url = baseURL + endpoint
  let result = await axios.post(url, {}, sign)
  return result.data
}

getSocketEndpoint = async function (type, baseURL, environment, sign) {
  let r
  if (type == 'private') {
    r = await getPrivateWsToken(baseURL, sign)
  } else {
    r = await getPublicWsToken(baseURL)
  }
  let token = r.data.token
  let instanceServer = r.data.instanceServers[0]

  if (instanceServer) {
    if (environment === 'sandbox') {
      return `${instanceServer.endpoint}?token=${token}&[connectId=${Date.now()}]`
    } else if (environment === 'live') {
      return `${instanceServer.endpoint}?token=${token}&[connectId=${Date.now()}]`
    }
  } else {
    throw Error("No Kucoin WS servers running")
  }
}

/*  
  Initiate a websocket
  params = {
    topic: enum 
    symbols: array [optional depending on topic]
  }
  eventHanlder = function
*/
Sockets.initSocket = async function (params, eventHandler) {
  try {
    if (!params.sign) params.sign = false;
    if (!params.endpoint) params.endpoint = false;
    let [topic, endpoint, type] = Sockets.topics(params.topic, params.symbols, params.endpoint, params.sign)
    let sign = this.sign('/api/v1/bullet-private', 'POST', {})
    let websocket = await getSocketEndpoint(type, this.baseURL, this.environment, sign)
    let ws = new WebSocket(websocket)

    ws.on('open', () => {
      Sockets.ws[topic] = ws
      console.log(topic + ' opening websocket connection... ')
      Sockets.subscribe(topic, endpoint, type, eventHandler)
      Sockets.ws[topic].heartbeat = setInterval(Sockets.socketHeartBeat, 20000, topic)
    })
    ws.on('error', (error) => {
      Sockets.handleSocketError(error)
      console.log(error)
    })
    ws.on('ping', () => {
      return
    })
    ws.on('close', () => {
      clearInterval(Sockets.ws[topic].heartbeat)
      console.log(topic + ' websocket closed...')
    })
  } catch (err) {
    console.log(err)
  }
}

Sockets.handleSocketError = function (error) {
  console.log('WebSocket error: ' + (error.code ? ' (' + error.code + ')' : '') +
    (error.message ? ' ' + error.message : ''))
}

Sockets.socketHeartBeat = function (topic) {
  let ws = Sockets.ws[topic]
  ws.ping()
}

Sockets.subscribe = async function (topic, endpoint, type, eventHandler) {
  let ws = Sockets.ws[topic]
  if (type === 'private') {
    ws.send(JSON.stringify({
      id: Date.now(),
      type: 'subscribe',
      topic: endpoint,
      privateChannel: true,
      response: true
    }))
  } else {
    ws.send(JSON.stringify({
      id: Date.now(),
      type: 'subscribe',
      topic: endpoint,
      response: true
    }))
  }
  ws.on('message', eventHandler)
}

Sockets.unsubscribe = async function (topic, endpoint, type, eventHandler) {
  let ws = Sockets.ws[topic]
  ws.send(JSON.stringify({
    id: Date.now(),
    type: 'unsubscribe',
    topic: endpoint,
    response: true
  }))
  ws.on('message', eventHandler)
}

Sockets.topics = function (topic, symbols = [], endpoint = false, sign = false) {
  if (endpoint) return [topic, endpoint + (symbols.length > 0 ? ':' : '') + symbols.join(','), sign ? 'private' : 'public']
  if (topic === 'ticker') {
    return [topic, "/contractMarket/ticker:" + symbols[0], 'public']
  } else if (topic === 'tickerv2') {
    return [topic, "/contractMarket/tickerV2:" + symbols[0], 'public']
  } else if (topic === 'orderbook') {
    return [topic, "/contractMarket/level2:", + symbols[0], 'public']
  } else if (topic === 'execution') {
    return [topic, "/contractMarket/execution:" + symbols[0], 'public']
  } else if (topic === 'fullMatch') {
    return [topic, "/contractMarket/level3v2:" + symbols[0], 'public']
  } else if (topic === 'depth5') {
    return [topic, "/contractMarket/level2Depth5:" + symbols[0], 'public']
  } else if (topic === 'depth50') {
    return [topic, "/contractMarket/level2Depth50" + symbols[0], 'public']
  } else if (topic === 'market') {
    return [topic, "/contract/instrument:" + symbols[0], 'public']
  } else if (topic === 'announcement') {
    return [topic, "/contract/announcement", 'public']
  } else if (topic === 'snapshot') {
    return [topic, "/contractMarket/snapshot:" + symbols[0], 'public']
  } else if (topic === 'ordersMarket') {
    return [topic, "/contractMarket/tradeOrders:", + symbols[0], 'private']
  } else if (topic === 'orders') {
    return [topic, "/contractMarket/tradeOrders", 'private']
  } else if (topic === 'advancedOrders') {
    return [topic, "/contractMarket/advancedOrders", 'private']
  } else if (topic === 'wallet') {
    return [topic, "/contractAccount/wallet", 'private']
  } else if (topic === 'position') {
    return [topic, " /contract/position:", + symbols[0], 'private']
  }
}

module.exports = Sockets
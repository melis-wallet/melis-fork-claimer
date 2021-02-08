//
// Written by Alessandro Polverini for Melis Wallet -- melis.io
//

const isNode = (require('detect-node') && !('electron' in global.process.versions))
const nodeFetch = require('node-fetch')
const bs58check = require('bs58check')
const MELIS = require('melis-api-js')
const varuint = require('varuint-bitcoin')
const Bitcoin = MELIS.Bitcoin
const bcrypto = Bitcoin.crypto
//const bscript = Bitcoin.script

// Address converter tests
// P2SH   3L9XoqFjwWCiqpDVvHFXroNKPuyy87v143 -> BTCP bxuZxSTk47esMjk5b8DytwyYdjGxVudZ2rq
// P2PKH: 1JH6b8DcfMW4eX9ir865zPaZJnoqzpeE5M -> BTCP b1MkJGK4cQWYAmoUHoGX4atZEw4WvFaqPH1
// P2PKH: 17BfWLPhL8T6cee6TkJ513wPfR79Ddca6T -> BTCP b1AesBXEh5HVCjvxfQtj3bYv5HgpDUozDBs

const MIGRATED_ACCOUNT_NAME_SUFFIX = " Claimed Coins"

const FORKS = {
  BCD: {
    fork: 495866,
    name: "Bitcoin Diamond",
    version: 12,
    // pubKeyHash: Buffer.from("00", 'hex'),
    // scriptHash: Buffer.from("05", 'hex'),
    signtype: 0x01,
    signid: 0x01,
    bcdGarbage: Buffer.from("FF".repeat(32), 'hex'),
    coinratio: 10,
    utxoApi: bcdQueryUtxo
  },
  BCI: {
    fork: 505083,
    name: "Bitcoin Interest",
    pubKeyHash: Buffer.from("66", 'hex'),
    scriptHash: Buffer.from("17", 'hex'),
    signtype: 0x41,
    signid: 0x41 | (0x4F << 8),
    bip143: true,
    insightApi: "https://explorer.bitcoininterest.io/api/"
  },
  BCX: {
    fork: 498888,
    name: "BitcoinX",
    pubKeyHash: Buffer.from("4b", 'hex'),
    scriptHash: Buffer.from("3f", 'hex'),
    signtype: 0x11,
    signid: 0x11,
    bip143: true,
    coinratio: 10000,
    insightApi: "https://bcx.info/insight-api/"
  },
  BTCP: {
    fork: 511346,
    name: "Bitcoin Private",
    pubKeyHash: Buffer.from("\x13\x25"),
    scriptHash: Buffer.from("\x13\xaf", 'ascii'),
    signtype: 0x41,
    signid: 0x41 | (42 << 8),
    insightApi: "http://explorer.btcprivate.org/api/"
  },
  BTG: {
    fork: 491407,
    name: "Bitcoin Gold",
    version: 2,
    pubKeyHash: Buffer.from("26", 'hex'),
    scriptHash: Buffer.from("17", 'hex'),
    signtype: 0x41,
    signid: 0x41 | (79 << 8),
    bip143: true,
    insightApi: "https://explorer.bitcoingold.org/insight-api/"
  },
  BTX: {
    fork: 492820,
    name: "BitCore",
    pubKeyHash: Buffer.from("03", 'hex'),
    scriptHash: Buffer.from("7D", 'hex'),
    signtype: 0x01,
    signid: 0x01,
    insightApi: "https://insight.bitcore.cc/api/"
  },
  LBTC: {
    fork: 499999,
    name: "Lightning Bitcoin",
    signtype: 0x01,
    signid: 0x01,
    //utxoApi: lbtcQueryUtxo
  },
  SBTC: {
    fork: 498888,
    name: "Super Bitcoin",
    signtype: 0x41,
    signid: 0x41,
    extraBytes: Buffer.from("0473627463", 'hex'),
    insightApi: "http://block.superbtc.org/insight-api/"
  },
  BSV: {
    forkedCoin: 'BCH',
    fork: 478558,
    name: "Bitcoin SV",
    bip143: true,
    signtype: 0x41,
    signid: 0x41,
    requiresAddressConversion: true,
    insightApi: "https://bchsvexplorer.com/api/",
    blockchair: "bitcoin-sv"
  },
  ABC: {
    forkedCoin: 'BCH',
    fork: 661648,
    name: "Bitcoin ABC",
    bip143: true,
    signtype: 0x41,
    signid: 0x41,
    blockchair: "bitcoin-abc"
  }
  /*
  BTC2: {
    fork: 507850,
    name "Bitcoin2"
  }
  B2X: {
    fork: 501451,
    name: "Segwit2X",
    signtype: 0x31, // 0x31 = 49
    signid: 0x62, // 0x31<<1
    isB2X: true,
    // signtype: 0,
    // signid: 0x31 << 8, // 0x31 49
    insightApi: "https://explorer.b2x-segwit.io/b2x-insight-api/"
  },
  BTW: {
    fork: 499777,
    name: "Bitcoin World"
  },

  BTC2: {
    fork: 507850,
    name: "Bitcoin 2" // https://www.bitc2.org/
  },
  BTF: {
    fork: 500000,
    name: "Bitcoin Faith"
  },
  BTSQ: {
    fork: 506066,
    name: "Bitcoin Community"
  },
  UBTC: {
    fork: 498777,
    name: "United Bitcoin" // Explorer non funzionante, e non insight
  },
  WBTC: {
    fork: 503888,
    name: "World Bitcoin"
  },
  BPA: {
    fork: 501888,
    name: "Bitcoin Pizza" // ANDATO
  },
  BTN: {
    fork: 501000,
    name: "Bitcoin New"
  },
  BTH: {
    fork: 498848,
    name: "Bitcoin Hot"
  },
  BTT: {
    fork: 501118,
    name: "Bitcoin Top"
  },
  BTP: {
    fork: 499345,
    name: "Bitcoin Pay"
  },
  BCK: {
    fork: 499999,
    name: "Bitcoin King"
  },
  CDY: {
    fork: 512666,
    name: "Bitcoin Candy",
    forkOfCash: true
  },

  // ANDATI
  BTV: { 
    fork: 505050,
    name: "Bitcoin Vote",
    signtype: 0x41,
    signid: 0x41 | (50 << 8),
    insightApi: "https://block.bitvote.one/insight-api/"
  },

  */
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function myJsonFetch(url, options) {
  const fetch = isNode ? nodeFetch : window.fetch
  if (!options)
    options = {}
  //options['no-cors'] = true
  //options['mode'] = 'no-cors'
  if (!options.timeout)
    options.timeout = 30000
  //if (options.doDebug)
  console.log("isNode: " + isNode + " JSONFETCH " + url)
  return fetch(url, options).catch(err => {
    console.error('myJsonFetch err: ' + err.message)
  }).catch(err => {
    console.log("Fetch error", err)
    return null
  }).then(res => {
    if (!res || !res.ok) {
      console.log(`Invalid fetch response from ${url} status: ${res.status} ${res.statusText}`)
      return null
    }
    return res.json()
  }).catch(err => {
    console.log("JSON conversion error", err)
    return null
  }).then(json => {
    if (options.doDebug)
      console.log("json: ", json)
    return json
  })
}

async function loadJsonUrl(url, params, options) {
  if (!params)
    params = {}
  if (!params.timeout)
    params.timeout = 30000
  if (!options)
    options = {}
  if (options.doDebug)
    console.log("Loading JSON from url: " + url)
  // params['no-cors'] = true
  // params['mode'] = 'no-cors'
  try {
    const res = await fetch(url, params)
    if (options.doDebug)
      console.log("api result:", res)
    if (res.status !== 200)
      if (!options || !options.okErrorCodes || !options.okErrorCodes.includes(res.status)) {
        console.log("URL returned error " + res.status + ": " + JSON.stringify(res))
        return null
      }
    return res.json()
  } catch (ex) {
    console.log("Unable to read from " + url + JSON.stringify(ex))
    return null
  }
}

function varSliceSize(someScript) {
  const length = someScript.length
  return varuint.encodingLength(length) + length
}

function writeUInt64LE(buffer, value, offset) {
  //verifuint(value, 0x001fffffffffffff)
  buffer.writeInt32LE(value & -1, offset)
  buffer.writeUInt32LE(Math.floor(value / 0x100000000), offset + 4)
  return offset + 8
}

function deriveAddressKeys(melis, account, unspents) {
  unspents.forEach(u => {
    const aa = u.aa
    u.key = melis.deriveAddressKey(account.num, aa.chain, aa.hdindex)
  })
}

// Explorers for unspents:
// BTCP: http://explorer.btcprivate.org/api/addr/b1Cg6wsJaaDACjnoLGmmm75bAYCEzN1GTvF/utxo
// BTG : https://explorer.bitcoingold.org/insight-api/addr/GVN41nnJW52MgNYvy4X1P4FTRrBXNNyb6V/utxo
// SBTC: http://block.superbtc.org/insight-api/addr/16xi7CHukkBndzVj4R7knquy3YatXgmVG4/utxo
// BCD : http://explorer.btcd.io/#/address?loading=true&address=19XcSCwrSFDPSRcCvmBu4cVV7gnv75nwQL

const fetchOptions = {
  headers: {
    "user-agent": "dev tool"
  }
}

// https://api.lbtc.io/gettxinfo?param=a4a39ff43ba9d82216668ef4550c5e6818ae880a697e3308727f4abeadad03fb
async function lbtcQueryUtxo(addrs, options) {
  const baseAddrUrl = "https://api.lbtc.io/"
  const goodOnes = []
  // https://api.lbtc.io/getaddressbalance?param=1NwbkGPq8rEWA9V6YiWWmpbEBxL94voj97
  // https://api.lbtc.io/v2/gettxbyaddr?param=1HPaSweSRNizErABfPmKPp5fVw66omr9oP

  // Prima controlliamo quali indirizzi hanno ancora balance
  if (options && options.doDebug) {
    fetchOptions.doDebug = true
    console.log("Checking " + addrs.length + " addresses")
  }
  for (let i = 0; i < addrs.length; i++) {
    const address = addrs[i]
    const url = baseAddrUrl + "getaddressbalance?param=" + address
    console.log("Loading " + url)
    const addrStats = await myJsonFetch(url, fetchOptions)
    if (!addrStats) {
      console.log("Invalid response from LBTC")
      return []
    }
    //await sleep(1100)
    if (addrStats.result > 1)
      goodOnes.push({
        address: address,
        //txCount: data.tx_count,
        balance: addrStats.result
      })
  }

  let tot = 0
  goodOnes.forEach(a => {
    console.log(a.address.padStart(35) + (" " + a.balance).padStart(10))
    tot += a.balance
  })
  console.log("Total: " + tot + " = " + (tot / 100000000) + " LBTC")
  return []
  // Poi prendiamo tutte le transazioni su quell'indirizzo?
  //https://api.lbtc.io/v2/gettxbyaddr?param=1HPaSweSRNizErABfPmKPp5fVw66omr9oP
}

async function bcdQueryUtxo(addrs, options) {
  const baseAddrUrl = "http://20.184.13.116/v2/addr/"
  const goodOnes = []

  // Prima controlliamo quali indirizzi hanno ancora balance
  if (options && options.doDebug) {
    fetchOptions.doDebug = true
    console.log("Checking " + addrs.length + " addresses")
  }
  for (let i = 0; i < addrs.length; i++) {
    const address = addrs[i]
    const url = baseAddrUrl + address
    console.log("Loading " + url)
    const addrStats = await myJsonFetch(url, fetchOptions)
    if (!addrStats) {
      console.log("Invalid response from BCD explorer")
      return []
    }
    const data = addrStats.data
    //console.log(data)
    await sleep(1100)
    if (!data) {
      console.log("Unable to load info for " + address)
      continue
    }
    if (data.balance)
      goodOnes.push({
        address: address,
        txCount: data.tx_count,
        balance: data.balance
      })
  }

  // Poi cerchiamo gli unspent relativi
  const unspents = []
  const pageSize = 50 // max is 50
  console.log("# BCD addresses with balance: " + goodOnes.length)
  for (let i = 0; i < goodOnes.length; i++) {
    const data = goodOnes[i]
    const address = data.address
    const basePageUrl = baseAddrUrl + address + "/history?verbose=3&pagesize=" + pageSize + "&page="
    let page = 0
    while (page * pageSize < data.txCount) {
      const url = basePageUrl + (page + 1)
      console.log("Loading " + url)
      const info = await myJsonFetch(url, fetchOptions)
      if (!info || !info.data || !info.data.list) {
        console.log("Unable to load BCD info for " + address)
        continue
      }
      await sleep(1000)
      const txData = info.data
      const list = txData.list
      //console.log("TX list size: " + list.length, list)
      list.forEach(l => {
        const item = l[0]
        //console.log("Checking item ", item)
        item.outputs.forEach(out => {
          //console.log("Checking out", out)
          if (out.addresses[0] === address && out.spent_n === -1 && out.value > 10) {
            const unspent = {
              address: address,
              txid: item.txid,
              vout: out.n,
              satoshis: out.value
            }
            console.log("Unspent added:", unspent)
            unspents.push(unspent)
          }
        })
      })
      page++
    }
  }
  return unspents
}

const BLOCKCHAIR_BASE_URL = "https://api.blockchair.com/"
async function blockchairQueryUtxo(coinName, addrs, options) {
  const maxQuerySize = 100
  const unspents = []
  let fromIndex = 0
  if (!options)
    options = {}
  options.okErrorCodes = [404]
  while (fromIndex < addrs.length) {
    const slice = addrs.slice(fromIndex, fromIndex + maxQuerySize)
    fromIndex += maxQuerySize
    const url = BLOCKCHAIR_BASE_URL + coinName + "/dashboards/addresses/" + slice.join(',') + "?limit=1000"
    console.log("Querying " + slice.length + " addrs in batch mode from blockchair.com. URL len: " + url.length)
    const res = await loadJsonUrl(url, {}, options)
    if (!res)
      return null
    if (!res.data)
      continue
    const utxo = res.data.utxo
    utxo.forEach(o => {
      const unspent = {
        txid: o.transaction_hash,
        vout: o.index,
        satoshis: o.value,
        address: o.address,
        height: o.block_id
      }
      unspents.push(unspent)
    })
    if (fromIndex < addrs.length)
      await sleep(2000)
  }
  return unspents
}

/*
Res: array di
{
address: "GK18bp4UzC6wqYKKNLkaJ3hzQazTc3TWBw",
txid: "c023f27a94e218c96302d2d7652b4cf57a54fa921f9c945c802c661c9ebf6dc4",
vout: 0,
scriptPubKey: "76a9140cb60a52559620e5de9a297612d49f55f7fd14ea88ac",
amount: 0.73881797,
satoshis: 73881797,
confirmations: 0,
ts: 1611588708
}
*/
async function insightQueryUtxo(baseApi, addrs, options) {
  const maxPerQuery = 50
  let res = []
  let todo = addrs
  while (todo.length > 0) {
    let slice = todo
    if (todo.length > maxPerQuery) {
      slice = todo.slice(0, maxPerQuery)
      todo = todo.slice(maxPerQuery)
    } else {
      todo = []
    }
    const url = baseApi + "addrs/" + slice.join(',') + "/utxo?noCache=1"
    const x = await myJsonFetch(url, options)
    if (!x)
      console.log("Invalid response for insight api: " + url)
    else
      res = res.concat(x)
  }
  return res
}

async function insightBroadcastTx(baseApi, tx) {
  const url = baseApi + "tx/send"
  options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      rawtx: tx
    })
  }
  console.log("POSTING TO " + url, options)
  return nodeFetch(url, options).catch(err => {
    console.error('insightBroadcastTx err: ' + err.message)
  }).then(res => {
    console.log("SEND TX RES status:" + res.status + " " + res.statusText)
    return res.json()
  })
}

async function btcComGetTx(hash) {
  const url = "https://chain.api.btc.com/v3/tx/" + hash.toLowerCase() + "?verbose=3"
  return myJsonFetch(url)
}

function toScriptSignature(sig, hashType) {
  const hashTypeBuffer = Buffer.alloc(1)
  hashTypeBuffer.writeUInt8(hashType, 0)
  return Buffer.concat([sig.toDER(), hashTypeBuffer])
}

class ForkClaimer {

  constructor(claimedCoin) {
    this.claimedCoin = claimedCoin
    if (!FORKS[claimedCoin])
      throw "Unsupported coin: " + claimedCoin
    this.forkInfo = FORKS[this.claimedCoin]
    if (!this.forkInfo.pubKeyHash)
      this.forkInfo.pubKeyHash = Buffer.from("00", 'hex')
    if (!this.forkInfo.scriptHash)
      this.forkInfo.scriptHash = Buffer.from("05", 'hex')
    if (!this.forkInfo.version)
      this.forkInfo.version = 1
    if (!this.forkInfo.coinratio)
      this.forkInfo.coinratio = 1
  }

  static getMelis() { return MELIS }

  static getCoins() {
    return Object.keys(FORKS).filter(c => c !== 'BSV' && c !== 'ABC')
  }

  static accountsForPrinting(accounts) {
    let res = "#Accounts: " + Object.keys(accounts).length
    Object.keys(accounts).forEach(pubId => {
      const a = accounts[pubId]
      const name = a.meta ? a.meta.name : "[no name]"
      res += "\n" + pubId + " " + a.coin + " " + a.type + " " + name
    })
    return res
  }

  getCoin() {
    return this.claimedCoin
  }

  getCoinRatio() {
    return this.forkInfo.coinratio
  }

  toString() {
    return "ForkClaimer[" + this.claimedCoin + "]"
  }

  getForkHeight() {
    return this.forkInfo.fork
  }

  supportsBroadcastTx() {
    const forkInfo = this.forkInfo
    return !!forkInfo.insightApi
  }

  async broadcastTx(tx) {
    const insightApi = this.forkInfo.insightApi
    const res = await insightBroadcastTx(insightApi, tx)
    return res.txid
  }

  supportsUtxoQuery() {
    const forkInfo = this.forkInfo
    return !!forkInfo.blockchair || !!forkInfo.insightApi || !!forkInfo.utxoApi
  }

  async queryUtxos(addrs, options) {
    const blockchair = this.forkInfo.blockchair
    const insightApi = this.forkInfo.insightApi
    const utxoApi = this.forkInfo.utxoApi
    if (blockchair) {
      const res = await blockchairQueryUtxo(blockchair, addrs, options)
      return res.filter(u => u.satoshis > this.forkInfo.coinratio)
    } else if (insightApi) {
      const res = await insightQueryUtxo(insightApi, addrs, options)
      if (Array.isArray(res)) {
        res.forEach(o => {
          if (!o.satoshis)
            o.satoshis = Number.parseInt((o.amount * 100000000).toFixed(0))
        })
      }
      return res.filter(u => u.satoshis > this.forkInfo.coinratio)
    } else if (utxoApi)
      return utxoApi(addrs, options)
    else
      throw ("No UTXO provider for " + this.forkInfo.name)
  }

  async getPossibleUnspents(melis, account) {
    return await melis.getUnspentsAtBlock(account, this.getForkHeight())
  }

  convertToCoinAddress(btcAddress) {
    if (!btcAddress.match('^[13].+'))
      return btcAddress
    //console.log("Request to convert " + btcAddress + " to format " + this.forkInfo.name + " format")
    const {
      version,
      hash
    } = Bitcoin.address.fromBase58Check(btcAddress)
    //console.log("Address " + btcAddress + " version: " + version + " hash: " + hash.toString('hex'))

    let prefix
    if (version == Bitcoin.networks.bitcoin.scriptHash) {
      prefix = this.forkInfo.scriptHash
    } else if (version == Bitcoin.networks.bitcoin.pubKeyHash) {
      prefix = this.forkInfo.pubKeyHash
    } else
      throw "Unexpected address version: " + version
    const payload = Buffer.allocUnsafe(prefix.length + hash.length)
    prefix.copy(payload, 0)
    hash.copy(payload, prefix.length)
    return bs58check.encode(payload)
  }

  decodeCoinAddress(coinAddress) {
    const decoded = bs58check.decode(coinAddress)
    console.log(coinAddress + " decoded:" + decoded.toString('hex'))
    const pubKeyHash = this.forkInfo.pubKeyHash
    if (!pubKeyHash.equals(decoded.slice(0, pubKeyHash.length)))
      throw "Coin address is not pubKeyHash: " + coinAddress
    return decoded.slice(pubKeyHash.length)
  }

  async findUnspentTxOuts(txouts, doDebug) {
    const self = this
    const infos = {}
    const addrs = []
    txouts.forEach(u => {
      //console.log("Working on ", u)
      const btcAddress = u.aa.address
      const coinAddress = this.convertToCoinAddress(btcAddress)
      if (doDebug)
        console.log("Checking " + btcAddress + " -> " + coinAddress + " of unspent " + u.tx + " / " + u.n)
      const keyAddress = coinAddress
      if (!addrs.includes(keyAddress)) {
        addrs.push(keyAddress)
        infos[keyAddress] = {
          coinAddress,
          btcAddress,
          key: u.key,
          aa: u.aa,
          origTx: u.tx,
          origVout: u.n,
          redeemScript: u.redeemScript,
          totalAmount: u.amount,
          numTxs: 1
        }
      } else {
        infos[keyAddress].totalAmount += u.amount
        infos[keyAddress].numTxs++
      }
    })
    if (doDebug) {
      console.log("Unique found addresses: " + addrs.length)
      addrs.forEach(address => {
        console.log(address + " #txs: " + infos[address].numTxs + " total: " + infos[address].totalAmount)
      })
    }
    if (!addrs.length)
      return { unspents: [], infos: {} }

    if (self.supportsUtxoQuery())
      return await self.queryUtxos(addrs, {
        doDebug
      }).then(nativeUnspents => {
        return { unspents: nativeUnspents, infos }
      })
    else {
      // TODO: Usare un explorer per verificare se effettivamente unspent
      const unspents = []
      txouts.forEach(u => {
        unspents.push({
          address: u.aa.address,
          txid: u.tx,
          vout: u.n,
          satoshis: u.amount
        })
      })
      return { unspents, infos }
    }
  }

  hashForSignature_legacy(ins, inIndex, inScript, outs, hashType) {
    const buffer = Buffer.allocUnsafe(2000)
    let offset = 0

    function writeSlice(slice) {
      offset += slice.copy(buffer, offset)
    }

    function writeUInt8(i) {
      offset = buffer.writeUInt8(i, offset)
    }

    function writeUInt32(i) {
      offset = buffer.writeUInt32LE(i, offset)
    }

    function writeInt32(i) {
      offset = buffer.writeInt32LE(i, offset)
    }

    function writeUInt64(i) {
      offset = writeUInt64LE(buffer, i, offset)
    }

    function writeVarInt(i) {
      varuint.encode(i, buffer, offset)
      offset += varuint.encode.bytes
    }

    function writeVarSlice(slice) {
      writeVarInt(slice.length);
      writeSlice(slice)
    }
    //function writeVector(vector) { writeVarInt(vector.length); vector.forEach(writeVarSlice) }

    // Version
    writeInt32(this.forkInfo.version)

    // bcdGarbage, if any
    if (this.forkInfo.bcdGarbage)
      writeSlice(this.forkInfo.bcdGarbage)

    // Number of inputs
    writeVarInt(ins.length)

    for (let i = 0; i < ins.length; i++) {
      const txIn = ins[i]
      writeSlice(txIn.hash)
      writeUInt32(txIn.index)
      if (i == inIndex)
        writeVarSlice(inScript)
      writeUInt32(Bitcoin.Transaction.DEFAULT_SEQUENCE)
    }

    // ins.forEach(function (txIn) {
    //   writeSlice(txIn.hash)
    //   writeUInt32(txIn.index)
    //   writeVarSlice(txIn.script)
    //   writeUInt32(txIn.sequence)
    // })

    writeVarInt(outs.length)
    outs.forEach(out => {
      if (!out.valueBuffer) {
        writeUInt64(out.value)
      } else {
        writeSlice(out.valueBuffer)
      }

      writeVarSlice(out.script)
    })

    // LockTime
    writeUInt32(0)

    // hash type
    writeUInt32(this.forkInfo.signid)
    //writeUInt32(this.forkInfo.signid | hashType)

    // extrabytes, if any
    if (this.forkInfo.extraBytes)
      writeSlice(this.forkInfo.extraBytes)

    console.log("toHash offset: " + offset + " " + buffer.slice(0, offset).toString('hex'))
    return bcrypto.hash256(buffer.slice(0, offset))
  }

  hashForSignature_BIP143(ins, inputToSign, inScript, outs, hashType) {
    const lockTime = 0
    var tbuffer, toffset

    function writeSlice(slice) {
      toffset += slice.copy(tbuffer, toffset)
    }

    function writeUInt32(i) {
      toffset = tbuffer.writeUInt32LE(i, toffset)
    }

    function writeUInt64(i) {
      toffset = writeUInt64LE(tbuffer, i, toffset)
    }

    function writeVarInt(i) {
      varuint.encode(i, tbuffer, toffset)
      toffset += varuint.encode.bytes
    }

    function writeVarSlice(slice) {
      writeVarInt(slice.length);
      writeSlice(slice)
    }

    // hashPrevOuts
    tbuffer = Buffer.allocUnsafe(36 * ins.length)
    toffset = 0
    ins.forEach(txIn => {
      writeSlice(txIn.hash)
      writeUInt32(txIn.index)
    })
    const hashPrevouts = bcrypto.hash256(tbuffer)

    // hashSequence
    tbuffer = Buffer.allocUnsafe(4 * ins.length)
    toffset = 0
    ins.forEach(txIn => writeUInt32(txIn.sequence))
    const hashSequence = bcrypto.hash256(tbuffer)

    // hashOutputs
    const txOutsSize = outs.reduce(function (sum, out) {
      return sum + 8 + varSliceSize(out.script)
    }, 0)
    tbuffer = Buffer.allocUnsafe(txOutsSize)
    toffset = 0
    outs.forEach(out => {
      writeUInt64(out.value)
      writeVarSlice(out.script)
      //console.log("[REMOVEME] out amount: " + out.value + " script: " + out.script.toString('hex'));
    })

    //console.log("[REMOVEME] outputsToHash: " + tbuffer.toString('hex'));
    const hashOutputs = bcrypto.hash256(tbuffer)

    tbuffer = Buffer.allocUnsafe(156 + varSliceSize(inScript))
    toffset = 0
    const input = ins[inputToSign]
    writeUInt32(this.forkInfo.version)
    writeSlice(hashPrevouts)
    //console.log("[REMOVEME] getPrevoutHash: " + hashPrevouts.toString('hex'));
    writeSlice(hashSequence)
    //console.log("[REMOVEME] getSequenceHash: " + hashSequence.toString('hex'));
    writeSlice(input.hash)
    writeUInt32(input.index)
    //console.log("[REMOVEME] serializedInput: " + input.hash.toString('hex') + " " + input.index);
    writeVarSlice(inScript)
    //console.log("[REMOVEME] inputScriptBytes: " + inScript.toString('hex'));
    writeUInt64(input.value)
    writeUInt32(input.sequence)
    writeSlice(hashOutputs)
    //console.log("[REMOVEME] getOutputsHash: " + hashOutputs.toString('hex'));
    writeUInt32(lockTime)
    writeUInt32(this.forkInfo.signid)
    //writeUInt32(this.forkInfo.signid | hashType)

    console.log("input #" + inputToSign + "BIP143 hashForSig: " + tbuffer.toString('hex'))
    return bcrypto.hash256(tbuffer)
  }

  hashForSignature(ins, inputToSign, inScript, outs, hashType) {
    if (this.forkInfo.bip143)
      return this.hashForSignature_BIP143(ins, inputToSign, inScript, outs, hashType)
    else
      return this.hashForSignature_legacy(ins, inputToSign, inScript, outs, hashType)
  }

  // TODO: Needs to check a lot more things now
  verifyClaimProposal(claim, unspent, targetAddress) {
    const unspents = claim.unspents
    const recipients = claim.recipients
    const inputAmount = unspent.amount
    const outputAmount = recipients.reduce(function (sum, output) {
      return sum + output.amount
    }, 0)
    console.log("[analyze] unspent:", unspent)
    console.log("[analyze] unspents:", unspents)
    console.log("[analyze] recipient:", recipients)
    const networkFees = inputAmount - outputAmount
    const hasTargetAddress = recipients.some(out => out.address === targetAddress)
    let unspentsMatch = unspents.length === 1
    const u = unspents[0]
    unspentsMatch = unspentsMatch && (u.hash === unspent.hash && u.n === unspent.n)
    console.log("[verifyClaimProposal] HasTargetAddres: " + hasTargetAddress + " fees: " + networkFees + " unspentsMatch: " + unspentsMatch)
    return unspentsMatch && hasTargetAddress
  }

  prepareSignaturesForClaim(melis, claim) {
    const tx = new Bitcoin.Transaction()
    const unspents = claim.unspents
    const recipients = claim.recipients

    //console.log("[prepareSignaturesForClaim] unspents:", unspents)
    let inputAmount = 0
    unspents.forEach(u => {
      tx.addInput(Buffer.from(u.hash, 'hex').reverse(), u.n, Bitcoin.Transaction.DEFAULT_SEQUENCE)
      inputAmount += u.amount
    })
    //console.log("[prepareSignaturesForClaim] recipients:", recipients)
    let outputAmount = 0
    recipients.forEach(recipient => {
      const script = Buffer.from(recipient.outScript, 'base64')
      //console.log("[REMOVEME] base64 " + recipient.outScript + " -> " + script.toString('hex'))
      tx.addOutput(script, recipient.amount)
      outputAmount += recipient.amount
    })

    const networkFees = inputAmount - outputAmount
    console.log("networkFees: " + networkFees)

    const ins = []
    unspents.forEach(u => ins.push({
      hash: Buffer.from(u.hash, 'hex').reverse(),
      index: u.n,
      value: u.amount,
      sequence: Bitcoin.Transaction.DEFAULT_SEQUENCE
    }))

    const account = claim.account
    console.log("# of inputs to sign: " + unspents.length + " account:", account)
    const signatures = []
    for (let i = 0; i < unspents.length; i++) {
      const u = unspents[i]
      const aa = u.aa
      if (aa) {
        console.log("Preparing signature for input#:" + i, u)
        const inputScript = Buffer.from(u.inputScript, 'base64')
        //console.log("Input Script: " + inputScript.toString('hex'))
        const hashForSignature = this.hashForSignature(ins, i, inputScript, tx.outs, Bitcoin.Transaction.SIGHASH_ALL)
        //console.log("input #" + i + " hashForSig: ", hashForSignature.toString('hex'))
        const key = melis.deriveAddressKey(account.num, aa.chain, aa.hdindex)
        const signature = key.sign(hashForSignature)
        signatures.push(signature.toDER().toString('hex'))
      }
    }
    //console.log("TX:", tx)
    return {
      id: claim.id,
      signatures
    }
  }

  async scanFork(melis, accounts, doDebug) {
    const claimer = this
    const result = []
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i]
      console.log("scanning account " + account.pubId + " type: " + account.type + " meta: " + JSON.stringify(account.meta))
      if (account.type !== '2' && account.type !== 'H') {
        console.log("Skipping account " + account.pubId + " of unsupported type " + account.type)
        continue
      }
      const possibleUnspents = await claimer.getPossibleUnspents(melis, account)
      const candidates = possibleUnspents.unspents
      console.log("scanning " + account.pubId + " " + account.type + " with #candidates: " + candidates.length)
      if (!candidates || !candidates.length)
        continue
      deriveAddressKeys(melis, account, candidates)
      const res = await claimer.findUnspentTxOuts(candidates, doDebug)
      const unspents = res.unspents
      const infos = res.infos
      if (!unspents || !unspents.length)
        continue
      const totSatoshis = unspents.reduce((acc, o) => acc + parseInt(o.satoshis), 0)
      const claimable = []
      unspents.forEach(unspent => {
        const info = infos[unspent.address]
        //console.log("info:", info)
        //console.log("unspent:", unspent)
        claimable.push({
          hash: unspent.txid,
          n: unspent.vout,
          amount: unspent.satoshis,
          aa: info.aa,
          address: info.btcAddress
        })
      })
      result.push({
        claimer,
        claimable,
        account,
        unspents,
        infos,
        totSatoshis,
        numCandidates: candidates.length
      })
      console.log("Account #" + i + ": " + account.pubId + " type: " + account.type + " #candidates: " + candidates.length +
        " #Unspents: " + unspents.length + " total satoshis: " + totSatoshis + " " + (totSatoshis / 100000000) + " " + claimer.getCoin())
    }
    return result
  }

  async redeem(melis, params) {
    const account = params.account
    const targetCoin = params.targetCoin
    const unspents = params.unspents
    const targetAddress = params.targetAddress
    const claimProposal = await melis.prepareUnspentForkClaim({
      account,
      targetCoin,
      targetAddress,
      unspents
    })
    console.log("Claim proposal: ", claimProposal)
    // TODO: Riabilitare il controllo?
    // const unspent = unspents[0]
    // const verified = this.verifyClaimProposal(claimProposal, unspent, targetAddress)
    // if (!verified)
    //   throw "Claim does not meet minimum sanity checks"
    // //if (!params.ignoreVerification)
    // //  doExit()
    const claimSignatures = this.prepareSignaturesForClaim(melis, claimProposal)
    const broadcastResult = await melis.submitForkClaim(claimSignatures.id, claimSignatures.signatures)
    //const broadcastResult = await submitClaim(claimSignatures)
    console.log("Transaction submitted correctly:", broadcastResult)
    return broadcastResult.hash
  }

  async findExistingMigratedAccount(melis, claimedCoin) {
    const accounts = melis.peekAccounts()
    //console.log("PEEKED ACCOUNTS:\n", ForkClaimer.accountsForPrinting(accounts))
    const pubId = Object.keys(accounts).find(pubId =>
      accounts[pubId].coin === claimedCoin &&
      accounts[pubId].meta && accounts[pubId].meta.migrationInfo === claimedCoin + MIGRATED_ACCOUNT_NAME_SUFFIX
    )
    console.log("[findExistingMigratedAccount] existing " + claimedCoin + " account: ", pubId)
    if (pubId)
      return pubId
    const creationOptions = {
      coin: claimedCoin,
      type: MELIS.C.TYPE_PLAIN_HD,
      meta: {
        name: "Claimed " + claimedCoin,
        migrationInfo: claimedCoin + MIGRATED_ACCOUNT_NAME_SUFFIX
      }
    }
    console.log("Creating account with options:", creationOptions)
    const res = await melis.accountCreate(creationOptions)
    console.log("Created " + claimedCoin + " account: ", res)
    return res.account.pubId
  }

  async bchForkScan(melis, accounts, doDebug, dustLimitPar) {
    const bchDriver = melis.getCoinDriver('BCH')
    const maxSliceSize = 20
    const res = {}
    const dustLimit = dustLimitPar ? dustLimitPar : 5000

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i]
      if (account.coin !== 'BCH') {
        console.log("Skipping account " + account.pubId + " " + account.coin)
        continue
      }
      if (account.type !== '2' && account.type !== 'H') {
        console.log("Skipping account " + account.pubId + " of unsupported type " + account.type)
        continue
      }
      console.log("scanning account " + account.pubId + " type: " + account.type + " meta: " + JSON.stringify(account.meta))

      let numCheckedAddrs = 0
      let slicePage = 0
      let unspents = []
      do {
        const slice = await melis.addressesGet(account, { page: slicePage++, size: maxSliceSize })
        // console.log("slicePage: " + slicePage + " maxSliceSize: " + maxSliceSize + " slice result: ", slice)

        if (!slice.list) {
          console.log("No addresses on melis for account " + account.pubId)
          break
        }

        const addrs = slice.list.map(aa => this.requiresAddressConversion ? bchDriver.toLegacyAddress(aa.address) : aa.address)
        if (doDebug)
          console.log("slicePage: " + slicePage + " maxSliceSize: " + maxSliceSize + " #Addresses: " + addrs.length + "\n", addrs)

        numCheckedAddrs += addrs.length
        const utxos = await this.queryUtxos(addrs, { doDebug })
        if (doDebug)
          console.log("utxos:", utxos)

        if (utxos.length)
          unspents = unspents.concat(utxos)

        if (!slice.hasNext)
          break
      } while (true)

      const filteredUnspents = unspents.filter(u => u.satoshis >= dustLimit)
      console.log("#unspents found: " + unspents.length + " #aboveDust(" + dustLimit + "): " + filteredUnspents.length
        + " #checkedAddrs: " + numCheckedAddrs + " slices used: " + slicePage + " (sliceSize:" + maxSliceSize + ")")
      if (unspents.length)
        res[account.pubId] = {
          utxos: filteredUnspents,
          account
        }
    }
    return res
  }

  async redeemBchFork(melis, params) {
    const claimedCoin = params.claimedCoin
    const coinDriver = melis.getCoinDriver(claimedCoin)
    const account = params.account
    const utxos = params.utxos
    const doDebug = params.doDebug
    let targetAddress = params.targetAddress

    if (doDebug)
      console.log("[" + claimedCoin + " CLAIM] utxos: ", utxos)
    if (!account)
      throw ("Missing account in parameters")
    if (!utxos || !utxos.length)
      throw ("Missing utxos in parameters")

    if (!targetAddress) {
      const pubId = await this.findExistingMigratedAccount(melis, claimedCoin)
      const aa = await melis.getPaymentAddressViaRest(pubId, { info: claimedCoin + ' Redeemed coins' })
      if (doDebug)
        console.log("Created new aa: ", aa)
      targetAddress = this.requiresAddressConversion ? coinDriver.toLegacyAddress(aa.address) : aa.address
    }

    console.log("Target " + claimedCoin + " address: ", targetAddress)
    const unspents = utxos.map(u => ({
      hash: u.txid,
      n: u.vout,
      address: u.address
    }))

    const res = await this.redeem(melis, {
      account,
      targetCoin: claimedCoin,
      targetAddress,
      unspents
    })

    return res
  }
}

module.exports = ForkClaimer
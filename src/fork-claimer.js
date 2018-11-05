//
// Written by Alessandro Polverini for Melis Wallet -- melis.io
//

const fetch = require('node-fetch')
const bs58check = require('bs58check')
const MELIS = require('melis-api-js')
const varuint = require('varuint-bitcoin')
const Bitcoin = MELIS.Bitcoin
const bscript = Bitcoin.script
const bcrypto = Bitcoin.crypto

//const Bitcoin = require('bitcoinjs-lib')
//const OPCODES = Bitcoin.opcodes
//const payments = Bitcoin.payments
//let Bitcoin

// Address converter tests
// P2SH   3L9XoqFjwWCiqpDVvHFXroNKPuyy87v143 -> BTCP bxuZxSTk47esMjk5b8DytwyYdjGxVudZ2rq
// P2PKH: 1JH6b8DcfMW4eX9ir865zPaZJnoqzpeE5M -> BTCP b1MkJGK4cQWYAmoUHoGX4atZEw4WvFaqPH1
// P2PKH: 17BfWLPhL8T6cee6TkJ513wPfR79Ddca6T -> BTCP b1AesBXEh5HVCjvxfQtj3bYv5HgpDUozDBs

const FORKS = {
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
  /*
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

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

async function myJsonFetch(url, options) {
  if (!options)
    options = {}
  if (!options.timeout)
    options.timeout = 20000
  if (options.doDebug)
    console.log("JSONFETCH " + url)
  return fetch(url, options).catch(err => {
    console.error('myJsonFetch err: ' + err.message)
    // }).then(res => res.json()).catch(err => {
    //   console.error('myJsonFetch toJson err: ' + err.message)
  }).then(res => {
    //console.log("FETCH RES:", res)
    return res.json()
  }).then(json => {
    if (options.doDebug)
      console.log("json: ", json)
    return json
  })
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
      const txData = info.data
      await sleep(1000)
      if (!txData || !txData.list) {
        console.log("Unable to load info for " + address)
        continue
      }
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
              txid: item.hash,
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

async function insightQueryUtxo(baseApi, addrs, options) {
  const maxPerQuery = 40
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
  return fetch(url, options).catch(err => {
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

function writeTxInfo(par) {
  console.log("=====")
  console.log("Input transaction: " + par.inputHash + " / " + par.inputOut)
  console.log("prevOutScript: " + par.prevOutScript.toString('hex'))
  console.log("unspent address: " + par.unspentAddress)
  console.log("Signing key: " + par.key.toWIF() + " " + par.key.d.toHex())
  console.log("Signing public key: " + par.key.getPublicKeyBuffer().toString('hex'))
  console.log("sourceAddress: " + par.sourceAddress)
  console.log("targetAddress: " + par.targetAddress + " " + par.targetAddressHash.toString('hex') + " amount: " + par.targetAmount.toString(16))
  console.log("outscript: " + par.outScript.toString('hex'))
  console.log("hashForSignature: " + par.hashForSignature.toString('hex'))
  console.log("scriptSig: " + par.scriptSig.toString('hex'))
  console.log("=====")
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

  static getCoins() {
    return Object.keys(FORKS)
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
    return !!forkInfo.insightApi || !!forkInfo.utxoApi
  }

  async queryUtxos(addrs, options) {
    const insightApi = this.forkInfo.insightApi
    const utxoApi = this.forkInfo.utxoApi
    if (insightApi) {
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

  convertToCoinAddress(btcAddress) {
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
      return {
        unspents: [],
        infos: {}
      }

    if (self.supportsUtxoQuery())
      return await self.queryUtxos(addrs, {
        doDebug
      }).then(nativeUnspents => {
        return {
          unspents: nativeUnspents,
          infos
        }
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
      return {
        unspents,
        infos
      }
    }
  }

  hashForSignature_legacy(ins, inIndex, inScript, outs, hashType) {
    if (ins.length !== 1)
      throw ("Only one input supported in hashForSignature_legacy")

    const txIn = ins[0]
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
    writeVarInt(1)

    writeSlice(txIn.hash)
    writeUInt32(txIn.index)
    writeVarSlice(inScript)
    writeUInt32(Bitcoin.Transaction.DEFAULT_SEQUENCE)

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
    ins.forEach(function (txIn) {
      writeSlice(txIn.hash)
      writeUInt32(txIn.index)
    })
    const hashPrevouts = bcrypto.hash256(tbuffer)

    // hashSequence
    tbuffer = Buffer.allocUnsafe(4 * ins.length)
    toffset = 0
    ins.forEach(function (txIn) {
      writeUInt32(txIn.sequence)
    })
    const hashSequence = bcrypto.hash256(tbuffer)

    // hashOutputs
    const txOutsSize = outs.reduce(function (sum, output) {
      return sum + 8 + varSliceSize(output.script)
    }, 0)
    tbuffer = Buffer.allocUnsafe(txOutsSize)
    toffset = 0
    outs.forEach(function (out) {
      writeUInt64(out.value)
      writeVarSlice(out.script)
    })

    const hashOutputs = bcrypto.hash256(tbuffer)

    tbuffer = Buffer.allocUnsafe(156 + varSliceSize(inScript))
    toffset = 0
    const input = ins[inputToSign]
    writeUInt32(this.forkInfo.version)
    writeSlice(hashPrevouts)
    writeSlice(hashSequence)
    writeSlice(input.hash)
    writeUInt32(input.index)
    writeVarSlice(inScript)
    writeUInt64(input.value)
    writeUInt32(input.sequence)
    writeSlice(hashOutputs)
    writeUInt32(lockTime)
    writeUInt32(this.forkInfo.signid)
    //writeUInt32(this.forkInfo.signid | hashType)

    console.log("BIP143 hash buffer: " + tbuffer.toString('hex'))
    return bcrypto.hash256(tbuffer)
  }

  hashForSignature(ins, inputToSign, inScript, outs, hashType) {
    if (this.forkInfo.bip143)
      return this.hashForSignature_BIP143(ins, inputToSign, inScript, outs, hashType)
    else
      return this.hashForSignature_legacy(ins, inputToSign, inScript, outs, hashType)
  }

  // OLD CODE? TODO: Verificare
  verifyClaimProposal(claim, unspent, targetAddress) {
    const unspents = claim.unspents
    const recipients = claim.recipients
    const inputAmount = unspent.amount
    const outputAmount = recipients.reduce(function (sum, output) {
      return sum + output.amount
    }, 0)
    const networkFees = inputAmount - outputAmount
    const hasTargetAddress = recipients.some(out => out.address === targetAddress)
    let unspentsMatch = unspents.length === 1
    const u = unspents[0]
    unspentsMatch = unspentsMatch && (u.hash === unspent.hash && u.n === unspent.n)
    console.log("HasTargetAddres: " + hasTargetAddress + " fees: " + networkFees + " unspentsMatch: " + unspentsMatch)
    return unspentsMatch && hasTargetAddress
  }

  prepareSignaturesForClaim(melis, claim) {
    const tx = new Bitcoin.Transaction()
    const unspents = claim.unspents
    const recipients = claim.recipients

    let inputAmount = 0
    unspents.forEach(u => {
      tx.addInput(Buffer.from(u.hash, 'hex').reverse(), u.n, Bitcoin.Transaction.DEFAULT_SEQUENCE)
      inputAmount += u.amount
    })

    let outputAmount = 0
    recipients.forEach(recipient => {
      tx.addOutput(Buffer.from(recipient.outScript, 'base64'), recipient.amount)
      outputAmount += recipient.amount
    })

    const networkFees = inputAmount - outputAmount
    console.log("networkFees: " + networkFees)

    const signatures = []
    for (let i = 0; i < unspents.length; i++) {
      const u = unspents[i]
      console.log("Preparing signature for:", u)
      const inputScript = Buffer.from(u.inputScript, 'base64')
      console.log("Input Script: " + inputScript.toString('hex'))
      // if (u.aa.redeemScript)
      // redeemScript= Buffer.from(u.aa.redeemScript, 'base64')
      // else {
      //   const decoded = Bitcoin.address.fromBase58Check(u.aa.address)
      //   console.log("Decoded address: ", decoded)
      //   redeemScript = bscript.pubKeyHash.output.encode(decoded.hash)
      // }
      //const hashForSignature = this.hashForSignature_legacy(Buffer.from(u.hash, 'hex').reverse(), u.n, inputScript, tx.outs, Bitcoin.Transaction.SIGHASH_ALL)

      const ins = [{
        hash: Buffer.from(u.hash, 'hex').reverse(),
        index: u.n,
        value: u.amount,
        sequence: Bitcoin.Transaction.DEFAULT_SEQUENCE
      }]

      const hashForSignature = this.hashForSignature(ins, 0, inputScript, tx.outs, Bitcoin.Transaction.SIGHASH_ALL)
      console.log("hash for sig: ", hashForSignature.toString('hex'))
      const account = claim.account
      const aa = u.aa
      const key = melis.deriveMyHdAccount(account.num, aa.chain, aa.hdindex)
      const signature = key.sign(hashForSignature)
      signatures.push(signature.toDER().toString('hex'))

      //   // TODO MULTISIG!?
      //   const redeemScript = Buffer.from(accountAddress.redeemScript, "hex")
      //   const decoded = Bitcoin.address.fromBase58Check(u.aa.address)
      //   console.log("Decoded address: ", decoded)
      //   scriptSig = bscript.pubKeyHash.output.encode(decoded.hash)
      // } else
      //   scriptSig = Buffer.from(u.inputScript, 'base64')
      // console.log("scriptSig: ", scriptSig.toString('hex'))
      // const key = info.key
      // let signature = key.sign(hashForSignature)
      // if (Buffer.isBuffer(signature))
      //   signature = Bitcoin.ECSignature.fromRSBuffer(signature)
      // // console.log("Signature:", signature)
      // const scriptSignature = toScriptSignature(signature, this.forkInfo.signtype) // Bitcoin.Transaction.SIGHASH_ALL
      // console.log("scriptSignature:", scriptSignature.toString('hex'))
      // //const scriptSig = bscript.compile(Bitcoin.script.pubKeyHash.input.encodeStack(scriptSignature, key.getPublicKeyBuffer()))
      // const scriptSig = bscript.compile([scriptSignature, key.getPublicKeyBuffer()])
      // //console.log("ScriptSig:", scriptSig.toString('hex'))
      // tx.setInputScript(i, scriptSig)
    }
    console.log("TX:", tx)
    return {
      id: claim.id,
      signatures
    }
  }
}

module.exports = ForkClaimer
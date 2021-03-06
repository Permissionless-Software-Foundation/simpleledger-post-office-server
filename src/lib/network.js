const errorMessages = require('./errorMessages')
const BCHJS = require('@psf/bch-js')
const config = require('../../config')

const bchjs = new BCHJS({
  restURL:
        config.network === 'mainnet'
          ? 'https://api.fullstack.cash/v3/'
          : 'https://tapi.fullstack.cash/v3/',
  apiToken: config.apiKey
})

class Network {
  constructor (config) {
    this.bchjs = bchjs
  }

  async fetchUTXOsForStampGeneration (cashAddress) {
    // Get UTXOs for the post office wallet.
    const utxoResponse = await this.bchjs.Electrumx.utxo(cashAddress)
    // console.log(`utxoResponse: ${JSON.stringify(utxoResponse, null, 2)}`)

    // Get UTXOs that are big enough to split into dust (stamps).
    const utxos = utxoResponse.utxos.filter(
      utxo => utxo.value > config.postageRate.weight * 2
    )

    // Exit if there are UTXOs to split.
    if (utxos.length <= 0) {
      throw new Error('Insufficient Balance for Stamp Generation')
    }

    return utxos
  }

  async fetchUTXOsForNumberOfStampsNeeded (numberOfStamps, cashAddress) {
    const utxoResponse = await this.bchjs.Electrumx.utxo(cashAddress)
    const txIds = utxoResponse.utxos
      .map(utxo => utxo.tx_hash)
      .splice(0, numberOfStamps)

    // Find SLP UTXOs, making sure not to spend them.
    const areSlpUtxos = await this.bchjs.SLP.Utils.validateTxid(txIds)
    const filteredTxIds = areSlpUtxos
      .filter(tokenUtxo => tokenUtxo.valid === false)
      .map(tokenUtxo => tokenUtxo.txid)
    const stamps = utxoResponse.utxos.filter(utxo =>
      filteredTxIds.includes(utxo.tx_hash)
    )
    if (stamps.length < numberOfStamps) {
      throw new Error(errorMessages.UNAVAILABLE_STAMPS)
    }
    return stamps.slice(0, numberOfStamps)
  }

  async validateSLPInputs (inputs) {
    const txIds = inputs.map(input => {
      const hash = Buffer.from(input.hash)
      return hash.reverse().toString('hex')
    })
    const validateResponse = await this.bchjs.SLP.Utils.validateTxid(txIds)
    validateResponse.forEach(response => {
      if (!response.valid) throw new Error(errorMessages.INVALID_PAYMENT)
    })
  }

  async broadcastTransaction (rawTransactionHex) {
    console.log('Broadcasting transaction...')
    const transactionId = await this.bchjs.RawTransactions.sendRawTransaction(
      rawTransactionHex
    )
    console.log(`https://explorer.bitcoin.com/bch/tx/${transactionId}`)
    return transactionId
  }
}

module.exports = Network

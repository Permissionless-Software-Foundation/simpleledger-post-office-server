// Global npm libraries.
const express = require('express')
const cors = require('cors')
const PaymentProtocol = require('bitcore-payment-protocol')

const { Transaction } = require('bitcoincashjs-lib')
const BCHJS = require('@psf/bch-js')

// Local libraries.
const config = require('./config')
const slpMiddleware = require('./src/lib/slpMiddleware')
const errorMessages = require('./src/lib/errorMessages')

const TransactionLib = require('./src/lib/transaction')
const transaction = new TransactionLib(config)

const Network = require('./src/lib/network')
const network = new Network()

// Instantiate bch-js.
const bchjs = new BCHJS({
  restURL:
        config.network === 'mainnet'
          ? 'https://api.fullstack.cash/v3/'
          : 'https://tapi.fullstack.cash/v3/',
  apiToken: config.apiKey
})

// Instantiate express.
const app = express()
app.use(cors())
app.use(slpMiddleware)

// GET endpoint allows wallets to query the post office settings.
app.get('/postage', function (req, res) {
  res.send(config.postageRate)
})
app.get('/', function (req, res) {
  res.send(config.postageRate)
})

// POST endpoint is used to apply postage stamps to transactions.
app.post('/postage', async function (req, res) {
  const paymentProtocol = new PaymentProtocol('BCH')
  try {
    if (!req.is('application/simpleledger-payment')) {
      res.status(400).send(errorMessages.UNSUPPORTED_CONTENT_TYPE)
      return
    }

    const rootSeed = await bchjs.Mnemonic.toSeed(config.mnemonic)
    const hdNode = bchjs.HDNode.fromSeed(rootSeed)
    const keyPair = bchjs.HDNode.toKeyPair(hdNode)
    const payment = PaymentProtocol.Payment.decode(req.raw)

    // Convert the tx hex into a JS object representing the transaction.
    const incomingTransaction = Transaction.fromHex(
      payment.transactions[0].toString('hex')
    )

    await network.validateSLPInputs(incomingTransaction.ins)
    const neededStampsForTransaction = transaction.getNeededStamps(
      incomingTransaction
    )
    const stamps = await network.fetchUTXOsForNumberOfStampsNeeded(
      neededStampsForTransaction,
      bchjs.HDNode.toCashAddress(hdNode)
    )
    const stampedTransaction = transaction.buildTransaction(
      incomingTransaction,
      stamps,
      keyPair
    )
    const transactionId = await network.broadcastTransaction(
      stampedTransaction
    )
    const memo = `Transaction Broadcasted: https://explorer.bitcoin.com/bch/tx/${transactionId}`
    payment.transactions[0] = stampedTransaction
    const paymentAck = paymentProtocol.makePaymentACK(
      { payment, memo },
      'BCH'
    )
    res.status(200).send(paymentAck.serialize())
  } catch (e) {
    console.error(e)
    if (Object.values(errorMessages).includes(e.message)) {
      res.status(400).send(e.message)
    } else {
      res.status(500).send(e.message)
    }
  }
})

// Start the server.
const server = app.listen(3000, async () => {
  const rootSeed = await bchjs.Mnemonic.toSeed(config.mnemonic)
  const hdNode = bchjs.HDNode.fromSeed(rootSeed)
  const cashAddress = bchjs.HDNode.toCashAddress(hdNode)

  const generateStamps = async () => {
    console.log('Generating stamps...')
    try {
      const utxosToSplit = await network.fetchUTXOsForStampGeneration(
        cashAddress
      )
      const splitTransaction = transaction.splitUtxosIntoStamps(
        utxosToSplit,
        hdNode
      )

      await network.broadcastTransaction(splitTransaction)
    } catch (e) {
      console.error(e.message || e.error || e)
    }
  }

  const stampGenerationIntervalInMinutes = 30
  setInterval(generateStamps, 1000 * 60 * stampGenerationIntervalInMinutes)

  console.log(`Send stamps to: ${bchjs.HDNode.toCashAddress(hdNode)}`)
  console.log('Post Office listening on port 3000!')
  generateStamps()
})

module.exports = server

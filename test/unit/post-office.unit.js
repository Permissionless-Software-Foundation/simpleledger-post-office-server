/*
  Unit tests for post-office.js.
*/

const chai = require('chai')
const assert = chai.assert
const chaiHttp = require('chai-http')
const sinon = require('sinon')

const Network = require('../../src/lib/network')
const Transaction = require('../../src/lib/transaction')

chai.use(chaiHttp)
describe('#post-office.js', () => {
  let sandbox
  let server

  beforeEach(() => {
    sandbox = sinon.createSandbox()

    sandbox
      .stub(Network.prototype, 'fetchUTXOsForStampGeneration')
      .resolves([])
    sandbox
      .stub(Transaction.prototype, 'splitUtxosIntoStamps')
      .resolves([])
    sandbox
      .stub(Network.prototype, 'broadcastTransaction')
      .resolves({})

    server = require('../../post-office')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('#getRootEndpoint', () => {
    it('should return postage rate data', async function () {
      // Mock network calls.
      sandbox
        .stub(Network.prototype, 'validateSLPInputs')
        .resolves([])
      sandbox
        .stub(Network.prototype, 'fetchUTXOsForNumberOfStampsNeeded')
        .resolves([])

      chai.request(server).get('/').end((err, res) => {
        assert.equal(res.status, 200)

        const result = JSON.parse(res.text)
        assert.property(result, 'version')
        assert.property(result, 'address')
        assert.property(result, 'weight')
        assert.property(result, 'stamps')
        assert.isArray(result.stamps)

        assert.isNull(err)
      })
    })
  })

  describe('#getPostageEndpoint', () => {
    it('should return postage rate data', async function () {
      // Mock network calls.
      sandbox
        .stub(Network.prototype, 'validateSLPInputs')
        .resolves([])
      sandbox
        .stub(Network.prototype, 'fetchUTXOsForNumberOfStampsNeeded')
        .resolves([])

      chai.request(server).get('/postage').end((err, res) => {
        assert.equal(res.status, 200)

        const result = JSON.parse(res.text)
        assert.property(result, 'version')
        assert.property(result, 'address')
        assert.property(result, 'weight')
        assert.property(result, 'stamps')
        assert.isArray(result.stamps)

        assert.isNull(err)
      })
    })
  })

  describe('#postPostageEndpoint', () => {
    it('should return error 400 when using unsupported Content-Type', async function () {
      // Mock network calls.
      sandbox
        .stub(Network.prototype, 'validateSLPInputs')
        .resolves([])
      sandbox
        .stub(Network.prototype, 'fetchUTXOsForNumberOfStampsNeeded')
        .resolves([])

      chai.request(server)
        .post('/postage')
        .set('Content-Type', 'application/json')
        .end((err, res) => {
          assert.equal(res.status, 400)
          assert.include(res.text, 'Unsupported Content-Type for payment')
          assert.isNull(err)
        })
    })

    it('should return error 400 when using unsupported OP_RETURN data', async function () {
      // Mock network calls.
      sandbox
        .stub(Network.prototype, 'validateSLPInputs')
        .returns(Promise.resolve([]))
      sandbox
        .stub(Network.prototype, 'fetchUTXOsForNumberOfStampsNeeded')
        .resolves([])

      const body = Buffer.from(
        '12870101000000010000000000000000000000000000000000000000000000000000000000000000ffffffff0804ffff001d02fd04ffffffff0100f2052a01000000434104f5eeb2b10c944c6b9fbcfff94c35bdeecd93df977882babc7f3a2cf7f5c81d3b09a68db7f0e04f21de5d4230e75e6dbe7ad16eefe0d4325a62067dc6f369446aac00000000',
        'hex'
      )
      const res = await chai.request(server)
        .post('/postage')
        .set('Content-Type', 'application/simpleledger-payment')
        .type('application/simpleledger-payment')
        .send(body)

      assert.equal(res.status, 400)
      assert.include(
        res.text,
        'Could not parse OP_RETURN output'
      )
    })

    it('should return error when using an empty body', async function () {
      // Mock network calls.
      sandbox
        .stub(Network.prototype, 'validateSLPInputs')
        .returns(Promise.resolve([]))
      sandbox
        .stub(Network.prototype, 'fetchUTXOsForNumberOfStampsNeeded')
        .resolves([])

      const res = await chai.request(server)
        .post('/postage')
        .set('Content-Type', 'application/simpleledger-payment')
        .type('application/simpleledger-payment')
        .send(Buffer.from('0', 'hex'))

      assert.equal(res.status, 500)
      assert.include(
        res.text,
        'Illegal buffer'
      )
    })

    it('should return with an status code of 200', async function () {
      // Mock network calls.
      sandbox
        .stub(Network.prototype, 'validateSLPInputs')
        .returns(Promise.resolve([]))
      sandbox
        .stub(Network.prototype, 'fetchUTXOsForNumberOfStampsNeeded')
        .resolves([])

      const res = await chai.request(server)
        .post('/postage')
        .set('Content-Type', 'application/simpleledger-payment')
        .type('application/simpleledger-payment')
        .send(Buffer.from('12aa020200000001ca6193753fe1e19d89c8785b89bd7bfd0f37efbd0037a27e2126e9fffaa87882030000006a47304402204863028b70ccee19721d6d06489a300be559d4906f3e92c2bdb4b215dd9a4de702201e21f572dfb914f6579388b58275896d5dcc3659164f252bb33a2c6d8ac03897c12103232b147c9483c6e7203b4f8a53c20fade7c12f2791e2e8303b78a5675c0bdad1ffffffff030000000000000000406a04534c500001010453454e442038e97c5d7d3585a2cbf3f9580c82ca33985f9cb0845d4dcce220cb709f9538b00800016bcc41e90000080003328b944c400022020000000000001976a91495ee39ad723020d9887e4132677fe827fe9bd46788ac22020000000000001976a91495ee39ad723020d9887e4132677fe827fe9bd46788ac0000000022046d656d6f', 'hex'))
      assert.equal(res.status, 200)
    })
  })
})

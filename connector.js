
const express = require('express')
const morgan = require('morgan')
const fetch = require('node-fetch')
const bodyParser = require('body-parser')

const app = express()
const OPTIONAL = true

app.use(bodyParser.json())
app.use(morgan('combined'))

// Credentials (SF is SuperFaktura)

const SFuser = ''
const SFpassword = ''
const SFemail = ''
const SFapikey = ''
const SFcompanyID = ''
const ElisSecret = 'secret_key ...'

// Helpers

const findAllValues = (value, data) => {
  if (data !== Object(data)) { return [] }
  var results = []
  if (data.constructor === Array) {
    for (var i = 0, len = data.length; i < len; i++) { results = results.concat(findAllValues(value, data[i])) }
    return results
  }
  for (var key in data) {
    if (key === 'schema_id') {
      if (data[key] === value) {
        if (data['value']) { return data['value'] }
      }
    }
    results = results.concat(findAllValues(value, data[key]))
  }
  return results
}

const findValue = (value, data, optional) => {
  const listOfValues = findAllValues(value, data)
  if (listOfValues.length > 0) {
    return listOfValues[0]
  } else if (!optional) {
    throw Error('Missing value ' + value)
  } else {
    return null
  }
}

const invoiceTypeTable = {
  'tax_invoice': 'regular', // bežná daňová faktura
  'debit_note': 'cancel', // námi vystavený dobropis, opravný daňový doklad, není evidován v nákladech
  'credit_note': 'cancel', // námi přijatý dobropis, opravný daňový doklad
  'proforma': 'proforma', // zálohová faktura
  'other': 'draft' // jiné, koncept
}

const findInvoiceType = (elisType) => {
  return invoiceTypeTable[elisType] ? invoiceTypeTable[elisType] : 'regular'
}

const sanitizeCurrency = (value) => {
  if (typeof value === 'string') { return value.toUpperCase() }
  return 'CZK'
}

const sanitizeNumber = (value) => {
  if (value instanceof String) { return parseFloat(value.replace(/\s/g, '')) }
  return value
}

const sanitizeString = (value) => {
  if (typeof value === 'string') { return encodeURIComponent(value) }
  return value
}

const getAccountPrefix = (number) => {
  if (typeof number === 'string') {
    const parts = number.split('-')
    return parts.length > 1 ? parts[0] : null
  } else {
    return null
  }
}

const getAccountNumber = (number) => {
  if (typeof number === 'string') {
    const parts = number.split('-')
    if (parts.length > 1) {
      return parts[1]
    } else {
      return parts[0]
    }
  } else {
    return number
  }
}

const sendError = (error, res) => {
  console.log(error)
  res.status(422).json({ 'messages': [{ 'content': error, 'type': 'error' }] })
}

const sendValidationWarning = (warning, res) => {
  console.log(warning)
  res.status(200).json({ 'messages': [{ 'content': warning, 'type': 'warning' }] })
}

// HTTP Auth

app.use((req, res, next) => {
  if (req.headers.authorization !== ElisSecret) {
    res.set('WWW-Authenticate', 'Basic realm="401"')
    res.status(401).send('Authentication required.')
    return
  }
  next() // Access granted
})

app.get('/', (req, res) => res.send('The connector is running'))

// Saving

const parseData = (content, res, validation) => {
  try {
    return {
      'Expense': {
        'type': findInvoiceType(findValue('invoice_type', content)),
        'name': sanitizeString(findValue('sender_name', content)),
        'currency': sanitizeCurrency(findValue('currency', content)),
        'variable': findValue('var_sym', content),
        'amount': sanitizeNumber(findValue('amount_total', content)), // adding total amount to field for amount without tax, a workaround for SF
        'vat': 0, // adding 0 instead of vat_detail_rate, to work around SF limitation of calculating total amount from tax
        'due': findValue('date_due', content),
        'created': findValue('date_issue', content),
        'taxable_supply': null,
        'payment_type': 'transfer',
        'document_number': findValue('invoice_id', content, OPTIONAL),
        'specific': findValue('spec_sym', content, OPTIONAL),
        'constant': findValue('const_sym', content, OPTIONAL),
        'delivery': findValue('date_uzp', content, OPTIONAL),
        'comment': sanitizeString(findValue('notes', content, OPTIONAL))
      },
      'Client': {
        'name': sanitizeString(findValue('sender_name', content)),
        'ico': findValue('sender_ic', content),
        'bank_account_prefix': getAccountPrefix(findValue('account_num', content, OPTIONAL)),
        'bank_account': getAccountNumber(findValue('account_num', content)),
        'bank_code': findValue('bank_num', content),
        'dic': findValue('sender_dic', content, OPTIONAL),
        'swift': findValue('bic', content, OPTIONAL),
        'iban': findValue('iban', content, OPTIONAL),
        'address': sanitizeString(findValue('sender_address', content, OPTIONAL))
      }
    }
  } catch (err) {
    if (validation) {
      sendValidationWarning(err, res)
    } else {
      sendError(err, res)
    }
    return false
  }
}

// Validation

app.post('/validate', (req, res) => {
  let data = req.body.content
  const result = parseData(data, res, true)
  if (result) {
    res.json({ 'messages': [] }) // success response
  }
})

// Saving

app.post('/save', async (req, res) => {
  const content = req.body.content
  const data = parseData(content, res, false)

  // get original document
  const docPath = req.body.meta.original_file
  const cleanPath = docPath.slice(8) // removing https://
  const authPath = 'https://' + SFuser + ':' + SFpassword + '@' + cleanPath

  try {
    const fileRes = await fetch(authPath, { credentials: 'include' })
    const buffer = await fileRes.buffer()
    sendToSF(res, data, buffer.toString('base64'))
  } catch (err) {
    console.log('Original file not found', err)
    sendToSF(res, data)
  }
})

const sendToSF = (res, data, doc) => {
  console.log('Sending data: ', data)
  if (doc) { data['Expense'].attachment = doc }
  const authorizationData = encodeURIComponent('email=' + SFemail + '&apikey=' + SFapikey + '&company_id=' + SFcompanyID)

  fetch('https://moje.superfaktura.cz/expenses/add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'Authorization': 'SFAPI ' + authorizationData
    },
    body: 'data=' + JSON.stringify(data)
  })
    .then((response) => {
      response.json().then((result) => {
        if (result.error === 1) { sendError(result.error_message, res) } else {
          console.log('Success')
          res.status(204).send() // success response
        }
      }).catch((error) => sendError(error, res))
    }).catch((error) => sendError(error, res))
}

app.listen(process.env.PORT, () => console.log(`Connector listening on port ${process.env.PORT}`))

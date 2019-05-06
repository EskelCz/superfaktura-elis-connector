# Superfaktura Elis Connector

Export your invoice data from Rossum Elis to Superfaktura.cz expenses.

### Installing

1. Fill Superfaktura credentials and Elis secret code to connector.js
2. Host a node.js server
3. Deploy and run connector.js there (dont forget to install packages with yarn or npm)
4. Add connector url to Elis (https://api.elis.rossum.ai/docs/#setup-a-connector)
5. Profit :)

# How to add to Elis
Authenticate with terminal and get an authorization token.
Fill your real data into all these: `....`
```
curl -s -H 'Content-Type: application/json' \
  -d '{"username": "....", "password": "...."}' \
  'https://api.elis.rossum.ai/v1/auth/login'
```
Get queue list, so you know your queue IDs
```
curl -H 'Authorization: token ....' \
  'https://api.elis.rossum.ai/v1/queues?workspace=8194&ordering=name'
```
Add your deployed connector
```
curl -H 'Authorization: token ....' -H 'Content-Type: application/json' \
  -d '{"name": "SF Connector", "queues": ["https://api.elis.rossum.ai/v1/queues/...."], "service_url": "https://path-to-your-server.com", "authorization_token":"...."}' \
  'https://api.elis.rossum.ai/v1/connectors'
```

# Schema
Elis allows to you customize which data points are extracted and which are shown for human users for validation.
This is distinguished by attibute `hidden: true|false`. For reference I've added the schema which I use, in [example-schema.json](example-schema.json).
Read more on the topic here: https://api.elis.rossum.ai/docs/#document-schema

# Notes

Good stuff
- The connector also sends the original pdf file as an attachment

Missing stuff
- Superfaktura doesn't allow adding of a total sum of VAT. They need sums of VAT categories, which currently is prone to mistakes from Elis and requires human validation. If you need to export VAT as well, feel free to contribute this functionality and let me know to issue #1.

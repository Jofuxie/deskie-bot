// src/functions/mongo.js
const { MongoClient, ServerApiVersion } = require('mongodb');

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error('Missing MONGODB_URI in environment variables.');
}

let client;
let db;

async function connectToMongo() {
  if (db) return db;

  client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  await client.connect();
  db = client.db('deskie');
  return db;
}

async function getTbrCollection() {
  const database = await connectToMongo();
  return database.collection('tbrEntries');
}

module.exports = {
  connectToMongo,
  getTbrCollection,
};
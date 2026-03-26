// src/functions/bookData.js
const axios = require('axios');

function truncate(text, max = 500) {
  if (!text) return 'No description available.';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function buildOpenLibraryWorkUrl(workKey) {
  if (!workKey) return null;
  return `https://openlibrary.org${workKey}`;
}

function buildOpenLibraryCoverUrl({ coverId, isbn }) {
  if (coverId) {
    return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
  }

  if (isbn) {
    return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
  }

  return null;
}

function buildGoodreadsSearchLink(title, authors = []) {
  const authorText = authors.length ? ` ${authors[0]}` : '';
  const query = `${title}${authorText}`.trim();
  return `https://www.goodreads.com/search?q=${encodeURIComponent(query)}`;
}

function normalizeOpenLibraryDoc(doc) {
  const title = doc.title || 'Unknown Title';
  const authors = Array.isArray(doc.author_name) && doc.author_name.length
    ? doc.author_name
    : ['Unknown Author'];

  const isbn = Array.isArray(doc.isbn) && doc.isbn.length
    ? doc.isbn[0]
    : null;

  const coverId = doc.cover_i || null;
  const openLibraryLink = buildOpenLibraryWorkUrl(doc.key);
  const coverUrl = buildOpenLibraryCoverUrl({ coverId, isbn });

  return {
    openLibraryKey: doc.key || null,
    title,
    subtitle: doc.subtitle || null,
    authors,
    publishedYear: doc.first_publish_year ? String(doc.first_publish_year) : 'Unknown',
    publisher: Array.isArray(doc.publisher) && doc.publisher.length
      ? doc.publisher[0]
      : 'Unknown',
    language: Array.isArray(doc.language) && doc.language.length
      ? doc.language.join(', ')
      : 'Unknown',
    isbn,
    coverUrl,
    openLibraryLink,
    goodreadsLink: buildGoodreadsSearchLink(title, authors),
    editionCount: doc.edition_count || 0,
    ratingsAverage: typeof doc.ratings_average === 'number' ? doc.ratings_average : null,
    ratingsCount: typeof doc.ratings_count === 'number' ? doc.ratings_count : null,
    wantToReadCount: typeof doc.want_to_read_count === 'number' ? doc.want_to_read_count : null,
    alreadyReadCount: typeof doc.already_read_count === 'number' ? doc.already_read_count : null,
    currentlyReadingCount: typeof doc.currently_reading_count === 'number' ? doc.currently_reading_count : null,
    subject: Array.isArray(doc.subject) && doc.subject.length
      ? doc.subject.slice(0, 5)
      : [],
    description: truncate(
      Array.isArray(doc.subject) && doc.subject.length
        ? `Subjects: ${doc.subject.slice(0, 8).join(', ')}`
        : 'No description available.'
    ),
  };
}

async function searchBooks(query, limit = 5) {
  const response = await axios.get('https://openlibrary.org/search.json', {
    params: {
      q: query,
      limit,
    },
    timeout: 15000,
  });

  const docs = response.data?.docs || [];
  return docs.map(normalizeOpenLibraryDoc);
}

async function getBestBookMatch(query) {
  const results = await searchBooks(query, 1);
  return results[0] || null;
}

module.exports = {
  searchBooks,
  getBestBookMatch,
};
const telegramBot = require('node-telegram-bot-api');
const axios = require('axios');
require('dotenv').config();

const TMDB_ENDPOINT = 'https://api.themoviedb.org/3/search/movie';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const TMDB_SINGLE_MOVIE_ENDPOINT = 'https://api.themoviedb.org/3/movie'
const API_KEY = 'nfLwNqxnqiXwHTyevO0KNyRajwdASkk5'

const bot = new telegramBot(process.env.TEL_TOKEN, {polling: true});

const cheerio = require('cheerio');

async function scrape1377x(movieName) {
    try {
        // 1. Search for the movie
        const searchURL = `https://www.1377x.to/search/${encodeURIComponent(movieName)}/1/`;
        const { data: searchData } = await axios.get(searchURL);
        const $ = cheerio.load(searchData);

        // Assuming you want the first search result
        const moviePageLink = $('td.name a:nth-child(2)').attr('href');

        if (!moviePageLink) {
            return;
        }

        // 2. Fetch movie page to get the magnet link
        const movieURL = 'https://www.1377x.to' + moviePageLink;
        const { data: movieData } = await axios.get(movieURL);
        const $$ = cheerio.load(movieData);
        
        const magnetLink = $$('a[href^="magnet:?xt="]').attr('href');

        if (magnetLink) {
            return magnetLink;
        } else {
            return null;
        }

    } catch (error) {
        return null;
    }
}

async function getSubtitleDetails(tmdbId){
    const baseUrl = 'https://api.opensubtitles.com/api/v1/subtitles';

    const params = {
        tmdb_id: tmdbId
    };

    try {
        const response = await axios.get(baseUrl, {
            params: params,
            headers: {
                'Api-Key': API_KEY,
                'User-Agent': 'blurayfilms v1.0'
            }
        });
        if (response.data.data && response.data.data[0]) {
            const subtitleRecord = response.data.data.filter((item) => {
                return item.attributes.language === 'en'
            });
            if (subtitleRecord && subtitleRecord[0]) {
                return subtitleRecord[0].attributes.url;
            }
        } else {
            return null;
        }

    } catch (error) {
        return null;
    }
}

async function getTrailerLink(tmdbId) {
    const endpoint = `https://api.themoviedb.org/3/movie/${tmdbId}/videos?api_key=${process.env.TMDB_TOKEN}`;
    
    try {
        const response = await axios.get(endpoint);
        const videos = response.data.results;

        const trailer = videos.find(video => video.type === 'Trailer');

        if (trailer && trailer.site === 'YouTube') {
            return `https://www.youtube.com/watch?v=${trailer.key}`;
        }
    } catch (error) {
        return null;
    }

    return null;
}

bot.on('message', async (message) => {
    const chatId = message.chat.id;
    const movieQuery = message.text;

    try {
        const response = await axios.get(TMDB_ENDPOINT, {
            params: {
                api_key: process.env.TMDB_TOKEN,
                query: movieQuery,
            },
        });

        const movies = response.data.results;

        if (movies && movies.length) {
            console.log('movies', movies);
            const options = {
                reply_markup: {
                    inline_keyboard: movies.filter((item) => item.vote_count > 5).map(movie => [{
                        text: `${movie.title} - (${movie.release_date.split('-')[0]}) ${movie.original_language.toUpperCase()} IMDB ${movie.vote_average.toFixed(1)}/10`,
                        callback_data: movie.id.toString()
                    }])
                }
            };
            bot.sendMessage(chatId, 'Please select a movie:', options);
        } else {
            bot.sendMessage(chatId, 'No results found.');
        }
    } catch (error) {
        bot.sendMessage(chatId, `An error occurred. Please try again. ${error.message}`);
    }
})

bot.on('callback_query', async (callbackQuery) => {

    const movieId = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    bot.sendMessage(chatId,`******************************* Here's the movie details you find for. You could see trailer and you can download subtitles also. *******************************`);
    try {
        const response = await axios.get(`${TMDB_SINGLE_MOVIE_ENDPOINT}/${movieId}`, {
            params: {
                api_key: process.env.TMDB_TOKEN
            },
        });
        const trailerUrl = await getTrailerLink(movieId);
    
        if (trailerUrl) {
            bot.sendMessage(chatId, `Here's the trailer: ${trailerUrl}`, {
                disable_web_page_preview: true
            });
        } else {
            bot.sendMessage(chatId, "Sorry, I couldn't find a trailer for that movie.");
        }
        const movie = response.data;
        const posterUrl = TMDB_IMAGE_BASE_URL + movie.poster_path;

        bot.sendPhoto(chatId, posterUrl, {
            caption: `Title: ${movie.title} - (${movie.release_date.split('-')[0]})`
        });

        const torrentLink = await scrape1377x("walk to remember");

        const messageText = `
            Here's your magnet link:
            \`\`\`
            ${torrentLink}
            \`\`\`
            Copy and paste it into your torrent client to start downloading.
            `;

        bot.sendMessage(chatId, messageText, { parse_mode: 'Markdown' });

        const opts = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Download', url: 'https://nuwan.com' }]
                ]
            }
        };
        
        bot.sendMessage(chatId, 'Click the button to download:', opts);

        const getSubtitle = await getSubtitleDetails(movieId);
        if (getSubtitle) {
            bot.sendMessage(chatId, `Here's the English subtitle: ${getSubtitle}`, {
                disable_web_page_preview: true
            });
        }
        else {
            bot.sendMessage(chatId, `Cannot find subtitle for this movie`);
        }
    } catch (error) {
        bot.sendMessage(chatId, error.message);
    }

    
});
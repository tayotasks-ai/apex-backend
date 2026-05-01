require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const fileUpload = require('express-fileupload');
const connectDB = require('./config/db');
const { errorHandler } = require('./middleware');
const routes = require('./routes');

const app = express();
connectDB();

app.use(helmet());
app.use(cors('*'));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({ useTempFiles: false, limits: { fileSize: 20 * 1024 * 1024 } }));

app.get('/health', (_, res) => res.json({ ok: true, ts: Date.now() }));
app.use('/api/v1', routes);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 ApexSchool API on :${PORT} [${process.env.NODE_ENV}]`));
module.exports = app;

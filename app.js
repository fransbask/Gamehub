import express from 'express'; // Express-kirjaston tuonti
import path from 'path';
import mongoose from 'mongoose'; // Mongoose-kirjaston tuonti
import session from 'express-session'; // Istunnonhallintakirjaston tuonti
import bcrypt from 'bcryptjs'; // bcrypt-kirjaston tuonti salasanan hashaukseen
import dotenv from 'dotenv'; // dotenv-kirjaston tuonti
import { fileURLToPath } from 'url'; // Tuodaan fileURLToPath apufunktio

import Post from './models/Post.js'; // Post-mallin tuonti
import User from './models/User.js'; // Käyttäjämallin tuonti

dotenv.config(); // dotenv-kirjaston konfigurointi

const app = express(); // Express-sovelluksen luonti
const __filename = fileURLToPath(import.meta.url); // Määritellään __filename nykyisen tiedoston URL:n perusteella
const __dirname = path.dirname(__filename); // Määritellään __dirname

app.set('view engine', 'ejs'); // Aseta EJS templating
app.set('views', path.join(__dirname, 'views')); // Aseta näkymien hakemisto

app.use(express.static(path.join(__dirname, 'public'))); // Staattisten tiedostojen palvelin

app.use(session({
  secret: process.env.SESSION_SECRET, // Istunnon salaisuus .env-tiedostosta
  resave: false,
  saveUninitialized: false
}));

// Middleware asettaa käyttäjänimen kaikille näkymille
app.use((req, res, next) => {
  if (req.session.userId) {
    User.findById(req.session.userId)
      .then(user => {
        if (user) {
          res.locals.username = user.username; // Aseta käyttäjänimi jokaiselle näkymälle
        }
        next();
      })
      .catch(err => {
        console.error("Error fetching user:", err);
        next(err);
      });
  } else {
    res.locals.username = null; // Varmista, että username on null, jos ei kirjautunut
    next();
  }
});

app.use(express.urlencoded({ extended: true })); // Käsittele URL-enkoodatut lomaketiedot

mongoose.connect(process.env.MONGODB_URI, { // Yhdistä tietokantaan
 useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("Yhteys tietokantaan on muodostettu"))
.catch((err) => console.log("Virhe tietokantaan yhdistäessä:", err));

// Rekisteröintireitti
app.get('/register', (req, res) => {
  res.render('register', { message: '' }); // Lähetä tyhjä viesti, jos mitään viestiä ei ole>
});

// Käsittele rekisteröintilomakkeen tiedot
app.post('/register', async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 12);
    const newUser = new User({
      username: req.body.username,
      password: hashedPassword
    });
    await newUser.save();
    res.render('login', { message: 'Onnistuneesti rekisteröitynyt! Voit nyt kirjautua sisään' });
  } catch (err) {
    res.render('register', { message: 'Rekisteröityminen epäonnistui. Käyttäjänimi voi olla jo käytössä.' });
  }
});

// Kirjautumissivun reitti
app.get('/login', (req, res) => {
  res.render('login', { message: '' });
});

// Käsittele kirjautumislomakkeen tiedot
app.post('/login', async (req, res) => {
  const user = await User.findOne({ username: req.body.username });
  if (user && await bcrypt.compare(req.body.password, user.password)) {
    req.session.userId = user._id; // Tallenna käyttäjän id istuntoon
    req.session.username = user.username; // Tallenna käyttäjänimi istuntoon
    res.redirect('/'); // Ohjaa käyttäjä etusivulle
  } else {
    res.render('login', { message: 'Kirjautuminen epäonnistui. Väärä käyttäjänimi tai salasana.' });
  }
});

// Middleware, joka varmistaa, että käyttäjä on kirjautunut
function isAuthenticated(req, res, next) {
  if (req.session.userId) {
    return next();
  }
  res.redirect('/login');
}

// Etusivun reitti
app.get('/', async (req, res) => {
  try {
    const posts = await Post.find(); // Hae kaikki postaukset tietokannasta
    res.render('index', { title: 'Blogi', posts: posts }); // Lähetä postaukset etusivulle
  } catch (error) {
    console.error('Virhe haettaessa postauksia:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Kirjaudu ulos
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/'); // Ohjaa käyttäjä etusivulle kirjautumisen jälkeen
  });
});

// Reitti kaikkien postausten hakuun
app.get('/posts', async (req, res) => {
  try {
    const posts = await Post.find();
    res.render('kirjoitukset', { title: 'Kirjoitukset', posts: posts });
  } catch (error) {
    console.error('Virhe haettaessa postauksia:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Reitti kirjoitusten sivulle
app.get('/kirjoitukset', async (req, res) => {
  try {
    const posts = await Post.find();
    res.render('kirjoitukset', { title: 'Kirjoitukset', posts: posts });
  } catch (error) {
    console.error('Virhe haettaessa postauksia:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Käsittely uuden kirjoituksen lähettämiseen
app.post('/posts', isAuthenticated, async (req, res) => {
  try {
    const newPost = new Post(req.body);
    const savedPost = await newPost.save();
    res.redirect('/kirjoitukset'); // Ohjaa käyttäjä kirjoitukset sivulle
  } catch (error) {
    console.error('Virhe tallennettaessa uutta postausta:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Reitti yksittäisen postauksen näyttämiseen
app.get('/post/:id', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      res.status(404).send('Postausta ei löydy');
      return;
    }
    res.render('post', { post: post });
  } catch (error) {
    console.error('Virhe haettaessa postausta:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Näytä lomake uuden kirjoituksen luomiseen
app.get('/new', (req, res) => {
  if (req.session.userId) {
    res.render('new'); // Näytä uuden kirjoituksen lomake kirjautuneille käyttäjille
  } else {
    res.redirect('/register'); // Ohjaa kirjautumattomat käyttäjät rekisteröitymissivulle
  }
});
app.post('/posts', isAuthenticated, async (req, res) => {
  try {
    const newPost = new Post(req.body);
    const savedPost = await newPost.save();
    res.redirect('/kirjoitukset'); // Ohjaa käyttäjä kirjoitukset sivulle
  } catch (error) {
    console.error('Virhe tallennettaessa uutta postausta:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => { // Palvelimen käynnistäminen
  console.log(`Sovellus on käynnissä osoitteessa http://localhost:${port}`);
});

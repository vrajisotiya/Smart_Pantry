if (process.env.NODE_ENV != "production") {
  require("dotenv").config();
}

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const path = require("path");
const ejsMate = require("ejs-mate");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user.js");
const wrapAsync = require("./utils/wrapAsync.js");
const flash = require("connect-flash");
const ExpressError = require("./utils/ExpressError.js");
const { isLoggedIn, saveRedirectUrl } = require("./middleware.js");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

const MONGO_URL = "mongodb://127.0.0.1:27017/smartpantry";

main()
  .then(() => {
    console.log("connected to DB");
  })
  .catch((err) => {
    console.log(err);
  });

async function main() {
  await mongoose.connect(MONGO_URL);
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "/public")));

const sessionOptions = {
  secret: "helloworld",
  resave: false,
  saveUninitialized: true,
  cookie: {
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
  },
};

app.use(session(sessionOptions));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:3000/auth/google/home",
    },
    async function (accessToken, refreshToken, profile, done) {
      const user = await User.findOne({
        googleId: profile.id,
      });
      if (!user) {
        const newUser = await User.create({
          googleId: profile.id,
          name: profile.displayName,
          photo: profile.photos[0].value,
          email: profile.emails[0].value,
          loginMethod: "google",
        });
        await newUser.save();
        return done(null, newUser);
      } else {
        return done(null, user);
      }
    }
  )
);

// passport.serializeUser(User.serializeUser());
// passport.deserializeUser(User.deserializeUser());

// passport.serializeUser((user, done) => {
//   done(null, user.id);
// });
// passport.deserializeUser(async (id, done) => {
//   const user = await UserGoogle.findById(id);
//   done(null, user);
// });

passport.serializeUser((user, done) => {
  done(null, {
    id: user.id,
    type: user.googleId ? "google" : "local",
  });
});

// Deserialize the user based on their type
passport.deserializeUser(async (userObj, done) => {
  try {
    const user = await User.findById(userObj.id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currUser = req.user;
  next();
});

app.get("/home", (req, res) => {
  res.render("pages/index.ejs");
});

app.get("/aboutus", (req, res) => {
  res.render("pages/aboutus.ejs");
});

app.get("/contactus", (req, res) => {
  res.render("pages/contactus.ejs");
});

app.get("/signup", (req, res) => {
  res.render("users/signup.ejs");
});

app.post(
  "/signup",
  wrapAsync(async (req, res) => {
    try {
      let { username, email, password } = req.body;
      const newUser = new User({ email, username });
      const registeredUser = await User.register(newUser, password);
      req.login(registeredUser, (err) => {
        if (err) {
          return next(err);
        }
        req.flash("success", "user was registered");
        res.redirect("/home");
      });
    } catch (e) {
      req.flash("error", e.message);
      res.redirect("/signup");
    }
  })
);

app.get("/login", (req, res) => {
  res.render("users/login.ejs");
});

app.post(
  "/login",
  saveRedirectUrl,
  passport.authenticate("local", {
    failureRedirect: "/login",
    failureFlash: true,
  }),
  async (req, res) => {
    req.flash("success", "Welcome to Smart Pantry");
    res.redirect("/home");
  }
);

app.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) {
      next(err);
    }
    req.flash("success", "you are logged out");
    res.redirect("/home");
  });
});

app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get(
  "/auth/google/home",
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    req.flash("success", "Welcome to Smart Pantry");
    res.redirect("/home");
  }
);

app.all("*", (req, res, next) => {
  next(new ExpressError(404, "Page Not Found"));
});

app.use((err, req, res, next) => {
  let { statusCode = 500, message = "Something went wrong" } = err;
  res.status(statusCode).render("error.ejs", { message });
});

app.listen(3000, () => {
  console.log("server is listening to port 3000");
});

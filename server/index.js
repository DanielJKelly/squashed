const express = require('express');
const path = require('path');
const passport = require('passport');
const session = require('express-session');
const mysqlDB = require('../database/index.js');
const mysqlModel = require('../database/model.js');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const passportGithub = require('./passport-github.js');
const cache = require('memory-cache');
const url = require('url');
const _ = require('underscore');

const app = express();

const port = process.env.PORT || 3000;

const server = app.listen(port, () => {
  console.log(`listening on ${port}!`);
});

const io = require('socket.io').listen(server);

const socketIds = {};

io.on('connection', (socket) => {
  console.log('socketId: ', socket.id);

  // keep track of user's socketId
  socket.on('registerSocket', (name) => {
    socketIds[name] = socket.id;
  });

  // server sends newMessage back to specific user.
  socket.on('messageAdded', (message) => {
    io.to(socketIds[message.receiver]).emit('messageAdded', message);
  });
});

app.use(express.static('./react-client/dist'));

app.use(require('cookie-parser')());
app.use((req, res, next) => {
  console.log(req.cookies);
  next();
});

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(session({
  secret: 'egh576',
  resave: false,
  saveUnitialized: true,
}));

// Intitialize passport
app.use(passport.initialize());

// Restore Session
app.use(passport.session());

app.get('/auth/github', passport.authenticate('github'));

app.get('/auth/github/return', passport.authenticate('github', { failureRedirect: '/' }),
  (req, res) => {
    console.log('cookie', req.cookies.INTERCEPTED_ROUTE)
    const path = req.cookies.INTERCEPTED_ROUTE === undefined ? '/' : req.cookies.INTERCEPTED_ROUTE;
    console.log('PATH-----', path);
    cache.put(req.sessionID, req.user);

    // res.redirect(url.format({
    //   pathname: path,
    //   query: {
    //     session: req.sessionID
    //   }
    // }));
    res.clearCookie("INTERCEPTED_ROUTE")
    .redirect(`${path}?session=${req.sessionID}`);
  }
);

app.get('/projects', (req, res) => {
  let techs;
  if (req.query.techs === undefined) {
    mysqlDB.retrieveProjects((projects) => {
      res.send(projects);
    });
  } else {
    techs = Array.isArray(req.query.techs) ? req.query.techs : [req.query.techs];
    mysqlDB.retrieveProjectsByTechs(techs, (projects) => {
      res.send(projects);
    });
  }
});

// GET request to database to get user info and user's projects
app.get('/developers/:username', (req, res) => {
  const username = req.params.username;
  mysqlDB.getUserInfo(username, (user) => {
    mysqlDB.getProjectsByUser(user.id, (projects) => {
      mysqlDB.getFollowersForUser(user.id, (followers) => {
        mysqlDB.getFollowingForUser(user.id, (following) => {

          // console.log('<><><><following', following);
          // [ RowDataPacket { id: 7, followed_user_id: 1, follower_id: 3 },
          //   RowDataPacket { id: 8, followed_user_id: 1, follower_id: 4 } ]

          let followersToReturn = [];
          followers.forEach((dataPacket) => {
            followersToReturn.push(dataPacket['follower_id']);
          });

          let followingToReturn = [];
          following.forEach((dataPacket) => {
            followingToReturn.push(dataPacket['followed_user_id']);
          });

          // console.log('user.id: \n', user.id, '\n');
          // console.log('followingToReturn: \n', followingToReturn, '\n');
          user.followers = followersToReturn;
          user.following = followingToReturn;
          user.projects = projects;
          res.send(user);
        });
      });
    });
  });
});

// GET request to database to project info and project's owner
app.get('/projects/:id', (req, res) => {
  const projectId = req.params.id;

  mysqlModel.selectAllWhere('projects', 'id', projectId, true, (project) => {
    mysqlModel.selectAllWhere('users', 'id', project.user_id, true, (user) => {
      project.user = user; // <-- is this being used anywhere?
      mysqlModel.selectAllWhere('technologies', 'project_id', project.id, false, (data) => {
        const response = [];
        const techs = [];
        data.forEach((element) => {
          techs.push(element['tech_name']);
        });
        response.push(project);
        response.push(techs);
        res.send(response);
      });
    });
  });
});

app.get('/checkSession', (req, res) => {
  mysqlDB.checkUserSession(req.sessionID, (user) => {
    res.send(user);
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return next(err);
    }
    mysqlDB.deleteUserSession(req.sessionID, (user) => {
    });
    req.logout();

    res.redirect('/');
  });
});

app.get('/searchProjects', (req, res) => {
  const queryTerm = req.query;
  mysqlDB.findProject(queryTerm.title, (err, data) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(200).json(data);
    }
  });
});

app.get('/*', (req, res) => {
  res.sendFile(path.join(`${__dirname}/../react-client/dist`, 'index.html'));
});

app.get('/', (req, res) => {
  res.status(200).json();
});

app.post('/projects', (req, res) => {
  mysqlModel.insertProjectData(req.body);
  res.status(201).json();
});


/***Delete request to projects Schemna**/

app.delete('/projects/:id', (req, res) => {
  console.log('delete in server', req.params.id);
  const projectId = req.params.id;
  mysqlDB.deleteProjectByProjectId(projectId, (project) => {
    res.send(project);
  });
});

/* ************************************ */

app.get('/testing', (req, res) => {
  res.status(200);
  res.send('GET request to testing');
});

module.exports = app;


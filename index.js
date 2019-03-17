/**
 * A Bot for Slack!
 */
/**
 * Define a function for initiating a conversation on installation
 * With custom integrations, we don't have a way to find out who installed us, so we can't message them :(
 */

// Standard Libraries.
let botContext = require('bot-context');
// Used for sending emails.
const MailService = require('./mailService.js');
let mailService = new MailService();
// Used for triggering mysql queries.
let mysql = require('mysql');
// Used for getting the time.
let moment = require('moment');
// Counter maintaining the context for each user.
var userCounter = new Object();
// Counter used to keep a track of the number of questions asked in the current set.
var questionsAsked = new Object();
// Map maintaining the meaning of each word.
var wordMeanings = new Object();
// Map containing information about which session is each user on.
var userSession = new Object();
// Map maintaining the correct choice for each question per user.
var rightChoice = new Object();
// Flag to indicate if the collection of word-meanings have been initialized or not.
var meaningsInit = false;

// Configurations used to administer the test.
// The number of options to be presented per question.
const num_options = 4;
// The maximum number of word-meaning pairs in the dictionary.
var maximumNumWords = 0;
// The number of questions that will be administered per test set.
const questionsPerTest = 10;

var connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'rootpass',
  database: 'gre_records'
});
connection.connect();

function onInstallation(bot, installer) {
  if (installer) {
    bot.startPrivateConversation({
      user: installer
    }, function(err, convo) {
      if (err) {
        console.log(err);
      } else {
        convo.say('I am a bot that has just joined your team');
        convo.say('You must now /invite me to a channel so that I can be of use!');
      }
    });
  }
}


/**
 * Configure the persistence options
 */

var config = {};
if (process.env.MONGOLAB_URI) {
  var BotkitStorage = require('botkit-storage-mongo');
  config = {
    storage: BotkitStorage({
      mongoUri: process.env.MONGOLAB_URI
    }),
  };
} else {
  config = {
    json_file_store: ((process.env.TOKEN) ? './db_slack_bot_ci/' : './db_slack_bot_a/'), //use a different name if an app or CI
  };
}

/**
 * Are being run as an app or a custom integration? The initialization will differ, depending
 */

if (process.env.TOKEN || process.env.SLACK_TOKEN) {
  //Treat this as a custom integration
  var customIntegration = require('./lib/custom_integrations');
  var token = (process.env.TOKEN) ? process.env.TOKEN : process.env.SLACK_TOKEN;
  var controller = customIntegration.configure(token, config, onInstallation);
} else if (process.env.CLIENT_ID && process.env.CLIENT_SECRET && process.env.PORT) {
  //Treat this as an app
  var app = require('./lib/apps');
  var controller = app.configure(process.env.PORT, process.env.CLIENT_ID, process.env.CLIENT_SECRET, config, onInstallation);
} else {
  console.log('Error: If this is a custom integration, please specify TOKEN in the environment. If this is an app, please specify CLIENTID, CLIENTSECRET, and PORT in the environment');
  process.exit(1);
}


/**
 * A demonstration for how to handle websocket events. In this case, just log when we have and have not
 * been disconnected from the websocket. In the future, it would be super awesome to be able to specify
 * a reconnect policy, and do reconnections automatically. In the meantime, we aren't going to attempt reconnects,
 * WHICH IS A B0RKED WAY TO HANDLE BEING DISCONNECTED. So we need to fix this.
 *
 * TODO: fixed b0rked reconnect behavior
 */
// Handle events related to the websocket connection to Slack
controller.on('rtm_open', function(bot) {
  console.log('** The RTM api just connected!');
});

controller.on('rtm_close', function(bot) {
  console.log('** The RTM api just closed');
  // you may want to attempt to re-open
});


/**
 * Core bot logic goes here!
 */
// BEGIN EDITING HERE!

controller.on('bot_channel_join', function(bot, message) {
  bot.reply(message, "I'm here!");
});

controller.hears('hello', 'direct_message', function(bot, message) {
  var user_id = message.user;
  console.log('Message Received from:' + message.user);
  bot.reply(message, 'Hello !! How are you doing !!');
  checkForEmail(bot, message);
});

controller.hears('Register', 'direct_message', function(bot, message) {
  var userId = message.user;
  var regex = /\S+[a-z0-9]@[a-z0-9\.]+/img;
  var patterns = message.text.match(regex);
  console.log("Messge Received="+message.text);
  if (patterns.length == 0) {
    console.log("No email address detected.");
  } else {
    var emailId = patterns[0];
    var emaildIdSplit = emailId.split('mailto:')[1];
    var emaildIdUniq = Array.from(new Set(emaildIdSplit.split('|')));
    var post = {
      user_id: userId,
      email_id: emaildIdUniq[0]
    };
    connection.query('INSERT INTO user_profile SET ?', post, function(error, result) {
      if (error) {
        console.log("Error in updating user information. Error=" + error);
      } else {
        console.log("Updated user log without any error.");
        post = {
          user_id: userId,
          test_id: 0
        };
        connection.query('INSERT INTO user_test_state SET ?', post, function(error, result) {
          if (error) {
            console.log("Error in user test state. Error = " + error);
          } else {
            console.log("Successfully updated the user test state.");
            bot.reply(message, "Successfully registered !! Say \"Begin\" to start the test series.");
          }
        });
      }
    });
  }
});

controller.hears(['start*','begin*', 'Start*', 'Begin*'], 'direct_message', function(bot, message) {
  var user_id = message.user;
  bot.reply(message, 'Starting test now. To answer a question you can say either of 1, 2, 3 or 4.\n');
  init(bot, message);
});

// This message is called every time a message is sent to the bot.
controller.on('direct_message', function(bot, message) {
  var userId = message.user;
  console.log('Received message:' + message.text + ' from userId:' + userId);
  let ctx = botContext.getOrCreate(userId);
  // If the context is not initialized it is initialized.
  if (!ctx.isSet()) {
    init(bot, message);
  }
  ctx.match(message.text, function(err, option, contextCb) {
    if (!err) {
      console.log('Valid match found on ' + message.text);
      contextCb(message.text, bot, message, 0);
    } else {
      console.log('Encountered error ' + err + ' while matching' + message.text);
    }
  });
});

function getWordMeanings(bot, message, callback) {
  connection.query('SELECT * from word_list', function(error, rows) {
    if (error) throw error;
    // Populating the wordMeanings dictionary.
    rows.forEach((row) => {
      wordMeanings[row.id] = {
        'word': row.word,
        'meaning': row.meaning
      };
    });
    meaningsInit = true;
    maximumNumWords = rows.length;
    callback(bot, message);
  });
}

function random() {
  const low = 0;
  const high = num_options - 1;
  var num = Math.random() * (high - low) + low;
  return num | 0;
}

function getQuestion(counter, userId) {
  // Index at which the right answer should be added.
  var correct_idx = random();
  if (!(userId in rightChoice)) {
    rightChoice[userId] = new Object();
  }
  rightChoice[userId][counter] = correct_idx + 1;
  var ques = "";
  var word = wordMeanings[counter].word;
  var answer = wordMeanings[counter].meaning;
  // Building the question.
  ques = ques.concat("What does " + word + " mean ?\n");
  // Number of options added.
  var i = 0;
  // Number of incorrect options added.
  var num_others = 0;
  while (i < num_options) {
    if (i == correct_idx) {
      ques = ques.concat(i + 1 + ") " + answer + "\n");
    } else {
      num_others = num_others + 1;
      // Taking a modulus to ensure out of bound indices are not accessed.
      var index = (counter + num_others) % maximumNumWords;
      ques = ques.concat(i + 1 + ") " + wordMeanings[index].meaning + "\n");
    }
    i = i + 1;
  }
  return ques;
}

function sendQuestion(bot, message) {
  var userId = message.user;
  console.log("Sending Question");
  var numQAsked = questionsAsked[userId];
  var counter = userCounter[userId];
  userCounter[userId] = userCounter[userId] + 1;
  questionsAsked[userId] = questionsAsked[userId] + 1;
  if (numQAsked < questionsPerTest) {
    bot.reply(message, getQuestion(counter, userId));
  } else {
    bot.reply(message, "Well done !! Sit tight for the results.");
    endTest(bot, message);
  }
}

function askQuestion(bot, message) {
  if (meaningsInit == false) {
    getWordMeanings(bot, message, sendQuestion);
  } else {
    sendQuestion(bot, message);
  }
}

function init(bot, message) {
  var userId = message.user;
  var query = "Select * from user_test_state where user_id = \"" + userId + "\"";
  userCounter[userId] = 1;
  questionsAsked[userId] = 0;
  userSession[userId] = 0;
  // Getting the current state of the user's session.
  connection.query(query, function(err, rows) {
    if (err) {
      console.log("Error in getting the test of the user. Error =" + err);
    } else {
      console.log("Fetched the test state of the user.");
      rows.forEach((row) => {
        var testId = row.test_id;
        userCounter[userId] = testId * questionsPerTest + 1;
        userSession[userId] = testId;
      });
      askQuestion(bot, message);
    }
  });
  let ctx = botContext.getOrCreate(userId);
  ctx.set(
    /^[0-9]$/, // The base matcher to matches only numbers.
    // Only if the match is true, the callback (checkResponse) is called.
    (option) => checkResponse(option, bot, message));
}

function checkResponse(option, bot, message) {
  var userId = message.user;
  let selectedOption = parseInt(option, 10);
  var counter = userCounter[userId];
  var expectedOption = rightChoice[userId][counter - 1];
  console.log("Selected Option =" + selectedOption);
  console.log("Expected Option =" + expectedOption);
  console.log("Counter =" + counter);
  // Checking if the response is right or not.
  if (selectedOption == expectedOption) {
    bot.reply(message, "Right Choice");
    askQuestion(bot, message);
    sendResponse(counter, true, message);
  } else {
    bot.reply(message, "Wrong Choice");
    askQuestion(bot, message);
    sendResponse(counter, false, message);
  }
}

function checkForEmail(bot, message) {
  var userId = message.user;
  var query = "Select * from user_profile where user_id = " + "\"" + userId + "\"";
  var emailId = "";
  connection.query(query, function(error, result) {
    if (error) {
      console.log("Error in getting email id. Error=" + error);
    } else {
      if (result.length == 0) {
        bot.reply(message, "Looks like you aren't registered as yet. To register, say \"Register\" followed by your email id.");
      } else {
        emailId = result[0].email_id;
        console.log("User is already registered. EmailId=" + emailId);
      }
    }
  });
}

function sendResponse(counter, isCorrect, message) {
  var userId = message.user;
  var word = wordMeanings[counter].word;
  var testId = userSession[userId] + 1;
  var timestamp = moment(Date.now()).format('YYYY-MM-DD HH:mm:ss');
  var post = {
    word: word,
    user_id: userId,
    is_correct: isCorrect,
    date: timestamp,
    test_id: testId
  };
  connection.query('INSERT INTO user_log SET ?', post, function(err, result) {
    if (err) {
      console.log("Error in updating user log. Error =" + err);
    } else {
      console.log("Updated user log without any error.");
    }
  });
}

function endTest(bot, message) {
  var userId = message.user;
  var testId = userSession[userId] + 1;
  var query = "UPDATE user_test_state SET test_id =  " + testId + " where user_id = \"" + userId + "\"";
  connection.query(query, function(error, result) {
    if (error) {
      console.log("Error in updating the user's test state.");
    } else {
      console.log("Successfully updated the user's test state.");
    }
    bot.reply(message, "Congratulations !! You have successfully completed the level " + testId + ". The results have been emailed to you.");
    mailService.sendReport(userId, connection, testId);
  });
  // Resetting user state.
  questionsAsked[userId] = 0;
}

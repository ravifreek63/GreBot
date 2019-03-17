// Module for sending an email.
var nodemailer = require('nodemailer');
function MailService() {}
function sendMail(email_id, test_idx, test_report) {
  var transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: 'contactstudybuddy1@gmail.com',
      pass: ''
    }
  });

  var mailOptions = {
    from: 'contactstudybuddy1@gmail.com',
    to: email_id,
    subject: 'Re: Test Report ' + test_idx,
    text: test_report
  };

  transporter.sendMail(mailOptions, function(error, info) {
    if (error) {
      console.log(error);
    } else {
      console.log('Email sent: ' + info.response);
    }
  });
};

// Function that is called after the test (@test_idx).
MailService.prototype.sendReport = function(user_id, connection, test_idx) {
  console.log("Sending Email To=" + user_id);
    // 1. Get User's Details from the database.
    var query = 'Select * from user_log where user_id = "' + user_id + '" and test_id = "' + test_idx + '"';
    console.log("Running query=" + query);
    connection.query(query, function (error, rows) {
      if (error) {
        console.log("Error in getting test information. Error =" + error);
      } else {
        console.log("Successfully fetched test information.");
        // 2. Generate User's Report.
        var num_correct = 0;
        var num_total = 0;
        var rightChoice = [];
        var wrongChoice = [];
        rows.forEach((row) => {
          if (row.is_correct == 1) {
            num_correct += 1;
            rightChoice.push(row.word);
          } else {
            wrongChoice.push(row.word);
          }
          num_total += 1;
        });
        var report = "You got " + num_correct + " out of " + num_total + " questions right.";
        if (rightChoice.length > 0) {
          report += "\n Words that you got right = " + rightChoice.join(",");
        }
        if (wrongChoice.length > 0) {
          report += "\n Words that you got wrong = " + wrongChoice.join(",");
        }
        // 3. Get User's Email Id.
        connection.query("Select * from user_profile where user_id = \"" + user_id + "\"", function(error, rows) {
           if (error) {
              console.log("Error in getting user information. Error =" + error);
           } else {
              console.log("Successfully fetched user's information.");
              var user_email = "";
              rows.forEach((row) => {
                 user_email = row.email_id;
                 console.log("EmailId=" + user_email);
                 // 4. Send an email to the user with the report built.
                 sendMail(user_email, test_idx, report);
              });
           }
        });
      }
    });
  };

module.exports = MailService;

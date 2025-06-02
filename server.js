const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const short = require('short-uuid');
const { stringify } = require('csv-stringify');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// Serve everything in "public"
app.use(express.static('public'));

// Student page => "/"
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Teacher console => "/console"
app.get('/console', (req, res) => {
  res.sendFile(__dirname + '/public/console.html');
});

// We'll track the entire quiz in-memory
let quiz = {
  code: null,
  teacherSocket: null,
  active: false,
  currentQuestion: 0,
  questionsAsked: [], // optional array to store detail on each Q if you want
  students: {} // socketId -> { name, answers: { questionNum -> 'A/B/C...' } }
};

// Generate short code
function genCode() {
  return short.generate().substring(0,6).toUpperCase();
}

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  // ---- TEACHER ----

  // Teacher wants to create a new quiz
  socket.on('teacher-join', () => {
    quiz.code = genCode();
    quiz.teacherSocket = socket.id;
    quiz.active = true;
    quiz.currentQuestion = 0;
    quiz.questionsAsked = [];
    quiz.students = {};

    socket.join(quiz.code);
    socket.emit('quiz-code', quiz.code);
    console.log(`Teacher joined => code=${quiz.code}`);
  });

  // Teacher rejoin (if they refreshed)
  socket.on('teacher-rejoin', (code) => {
    if (quiz.active && quiz.code === code) {
      quiz.teacherSocket = socket.id;
      socket.join(quiz.code);
      socket.emit('quiz-code', quiz.code);
      console.log(`Teacher rejoined => code=${quiz.code}`);
      // Re-send student info so teacher sees the updated list
      updateTeacherStudentInfo();
    } else {
      socket.emit('no-active-quiz');
    }
  });

  // Teacher sends new question
  socket.on('new-question', ({ questionNumber, numOptions }) => {
    quiz.currentQuestion = questionNumber;
    quiz.questionsAsked.push({ questionNumber, numOptions });
    // Broadcast to students
    io.to(quiz.code).emit('question', { questionNumber, numOptions });
    console.log(`Teacher => question #${questionNumber}, ${numOptions} options`);
  });

  // Teacher ends quiz
  socket.on('end-quiz', () => {
    if (socket.id === quiz.teacherSocket && quiz.active) {
      quiz.active = false;
      io.to(quiz.code).emit('quiz-ended');
      console.log('Quiz ended by teacher');
    }
  });

  // ---- STUDENT ----

  // Student tries to join (fresh)
  socket.on('student-join', ({ quizCode, studentName }) => {
    if (!quiz.active || quizCode !== quiz.code) {
      socket.emit('join-failed', 'Invalid code or quiz not active.');
      return;
    }
    quiz.students[socket.id] = { name: studentName, answers: {} };
    socket.join(quizCode);
    socket.emit('joined-quiz');
    updateTeacherStudentInfo();
    console.log(`Student "${studentName}" joined => code=${quizCode}`);
  });

  // Student rejoin (page refresh)
  socket.on('student-rejoin', ({ quizCode, studentName }) => {
    if (!quiz.active || quizCode !== quiz.code) {
      socket.emit('join-failed', 'Invalid code or quiz not active.');
      return;
    }
    // We'll treat them as a new socket ID. 
    // They won't have prior answers unless you store them keyed by "name" or user ID.
    quiz.students[socket.id] = { name: studentName, answers: {} };
    socket.join(quizCode);
    socket.emit('joined-quiz');
    updateTeacherStudentInfo();
    console.log(`Student rejoined => code=${quizCode}, name=${studentName}`);
  });

  // Student answers
  socket.on('submit-answer', ({ quizCode, questionNumber, answer }) => {
    if (!quiz.active || quizCode !== quiz.code) return;
    const student = quiz.students[socket.id];
    if (!student) return;

    student.answers[questionNumber] = answer;

    // Build tallies
    const counts = { A:0, B:0, C:0, D:0, E:0 };
    for (const sid in quiz.students) {
      const ans = quiz.students[sid].answers[questionNumber];
      if (ans && counts[ans] !== undefined) {
        counts[ans]++;
      }
    }
    // Send updated counts to teacher
    io.to(quiz.teacherSocket).emit('answer-counts', {
      questionNumber,
      counts
    });
  });

  // ---- DISCONNECTS ----

  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    // If teacher => end quiz
    if (quiz.teacherSocket === socket.id && quiz.active) {
      quiz.active = false;
      io.to(quiz.code).emit('quiz-ended');
      console.log('Teacher left => quiz ended');
    }
    // If student => remove from list
    if (quiz.students[socket.id]) {
      delete quiz.students[socket.id];
      updateTeacherStudentInfo();
    }
  });
});

// ---- HELPER ----

function updateTeacherStudentInfo() {
  if (!quiz.teacherSocket) return;
  const names = Object.values(quiz.students).map(s => s.name);
  io.to(quiz.teacherSocket).emit('student-count', {
    count: names.length,
    names
  });
}

// CSV route => fill "NA" for unanswered
app.get('/download-csv/:quizCode', (req, res) => {
  if (req.params.quizCode !== quiz.code) {
    return res.status(400).send('Quiz code mismatch.');
  }

  const rows = [];
  rows.push({ Info: 'Quiz Code', Value: quiz.code });
  rows.push({ Info: 'Active?', Value: quiz.active });
  rows.push({});

  // For each student => for each question up to quiz.currentQuestion => if no answer => "NA"
  for (const sid in quiz.students) {
    const st = quiz.students[sid];
    for (let qNo = 1; qNo <= quiz.currentQuestion; qNo++) {
      let ans = st.answers[qNo];
      if (!ans) ans = 'NA'; // missed => NA
      rows.push({
        Student: st.name,
        QuestionNumber: qNo,
        Answer: ans
      });
    }
  }

  stringify(rows, {
    header: true,
    columns: [
      { key: 'Info', header: 'Info' },
      { key: 'Value', header: 'Value' },
      { key: 'Student', header: 'Student' },
      { key: 'QuestionNumber', header: 'QuestionNumber' },
      { key: 'Answer', header: 'Answer' }
    ]
  }, (err, csvStr) => {
    if (err) return res.status(500).send('Error generating CSV');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="quiz_${quiz.code}.csv"`);
    res.send(csvStr);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

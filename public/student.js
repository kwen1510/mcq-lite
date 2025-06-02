document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  const joinSection = document.getElementById('join-section');
  const nameInput = document.getElementById('nameInput');
  const codeInput = document.getElementById('codeInput');
  const joinBtn = document.getElementById('joinBtn');

  const quizArea = document.getElementById('quiz-area');
  const questionNumberSpan = document.getElementById('questionNumber');
  const answerOptionsDiv = document.getElementById('answerOptions');
  const messageP = document.getElementById('message');

  // If we have "role=student" in session => try rejoin
  if (
    sessionStorage.getItem('role') === 'student' &&
    sessionStorage.getItem('quizCode') &&
    sessionStorage.getItem('studentName')
  ) {
    const code = sessionStorage.getItem('quizCode');
    const nm = sessionStorage.getItem('studentName');

    // Attempt student rejoin
    socket.emit('student-rejoin', { quizCode: code, studentName: nm });
  }

  // Also if user scanned QR => fill code
  const params = new URLSearchParams(window.location.search);
  if (params.has('quizCode')) {
    codeInput.value = params.get('quizCode');
  }

  joinBtn.addEventListener('click', () => {
    const nm = nameInput.value.trim();
    const code = codeInput.value.trim().toUpperCase();
    if (!nm || !code) {
      alert('Please enter name & code');
      return;
    }
    socket.emit('student-join', { quizCode: code, studentName: nm });
  });

  // If joined => hide form, show quiz
  socket.on('joined-quiz', () => {
    joinSection.classList.add('d-none');
    quizArea.classList.remove('d-none');
    messageP.textContent = 'Waiting for teacher to send question...';

    // Store to session => so refreshing rejoin
    sessionStorage.setItem('role', 'student');
    sessionStorage.setItem('quizCode', codeInput.value.trim().toUpperCase());
    sessionStorage.setItem('studentName', nameInput.value.trim());
  });

  // If join fails => alert
  socket.on('join-failed', (msg) => {
    alert(msg);
  });

  // Teacher sends question
  socket.on('question', (data) => {
    // data = { questionNumber, numOptions }
    questionNumberSpan.textContent = data.questionNumber;
    messageP.textContent = '';
    answerOptionsDiv.innerHTML = '';

    for (let i = 0; i < data.numOptions; i++) {
      const label = String.fromCharCode(65 + i);
      const btn = document.createElement('button');
      btn.classList.add('btn', 'btn-info', 'answer-button');
      btn.textContent = label;
      btn.onclick = () => {
        // disable all
        document.querySelectorAll('.answer-button').forEach(b => b.disabled = true);
        messageP.textContent = `You chose ${label}`;
        socket.emit('submit-answer', {
          quizCode: codeInput.value.trim().toUpperCase(),
          questionNumber: data.questionNumber,
          answer: label
        });
      };
      answerOptionsDiv.appendChild(btn);
    }
  });

  // Quiz ended
  socket.on('quiz-ended', () => {
    messageP.textContent = 'Quiz has ended.';
    answerOptionsDiv.innerHTML = '';
    // Clear session
    sessionStorage.removeItem('role');
    sessionStorage.removeItem('quizCode');
    sessionStorage.removeItem('studentName');
  });
});

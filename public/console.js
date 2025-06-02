document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  // DOM refs
  const quizCodeSpan = document.getElementById('quizCode');
  const qrCodeDiv = document.getElementById('qrCode');
  const joinLink = document.getElementById('joinLink');
  const studentCountSpan = document.getElementById('studentCount');
  const studentsUl = document.getElementById('students');

  const sendBtn = document.getElementById('sendBtn');
  const endBtn = document.getElementById('endBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const questionNumberSpan = document.getElementById('questionNumber');
  const chartContainer = document.getElementById('chart-container');
  const chartCanvas = document.getElementById('chart');

  let currentQuestionNumber = 0;
  let currentNumOptions = 4; // default
  let chart = null;
  let quizCode = null;

  // ---- SessionStorage-based rejoin logic ----
  // If we have sessionStorage.role === 'teacher' & quizCode => attempt "teacher-rejoin"
  if (
    sessionStorage.getItem('role') === 'teacher' &&
    sessionStorage.getItem('quizCode')
  ) {
    quizCode = sessionStorage.getItem('quizCode');
    // Attempt rejoin
    socket.emit('teacher-rejoin', quizCode);
  } else {
    // If not => create new quiz as normal
    socket.emit('teacher-join');
  }

  // If server says "no-active-quiz", we simply do a new quiz
  socket.on('no-active-quiz', () => {
    console.log('No active quiz found. Creating a new one.');
    sessionStorage.removeItem('role');
    sessionStorage.removeItem('quizCode');
    socket.emit('teacher-join'); // create brand new
  });

  // Receive quiz code
  socket.on('quiz-code', (code) => {
    quizCode = code;
    quizCodeSpan.textContent = code;
    // store in session
    sessionStorage.setItem('role', 'teacher');
    sessionStorage.setItem('quizCode', code);

    // build link
    const link = `${window.location.origin}?quizCode=${code}`;
    joinLink.textContent = link;
    joinLink.href = link;

    // Make QR
    new QRCode(qrCodeDiv, {
      text: link,
      width: 128,
      height: 128,
    });
  });

  // Student count
  socket.on('student-count', (data) => {
    studentCountSpan.textContent = data.count;
    studentsUl.innerHTML = '';
    data.names.forEach((name) => {
      const li = document.createElement('li');
      li.textContent = name;
      studentsUl.appendChild(li);
    });
  });

  // Radio logic
  document.querySelectorAll('input[name="opt"]').forEach((r) => {
    r.addEventListener('change', () => {
      currentNumOptions = parseInt(r.value, 10);
    });
  });

  // Send first / next question
  sendBtn.addEventListener('click', () => {
    currentQuestionNumber++;
    questionNumberSpan.textContent = currentQuestionNumber;

    if (currentQuestionNumber === 1) {
      chartContainer.classList.remove('d-none');
      endBtn.classList.remove('d-none');
      sendBtn.textContent = 'Send Next Question';
      // If you want to forcibly collapse students:
      // const studentCollapse = new bootstrap.Collapse(document.getElementById('studentCollapse'));
      // studentCollapse.hide();

      createChart(currentNumOptions);
    } else {
      resetChart(currentNumOptions);
    }

    socket.emit('new-question', {
      questionNumber: currentQuestionNumber,
      numOptions: currentNumOptions,
    });
  });

  // End quiz
  endBtn.addEventListener('click', () => {
    socket.emit('end-quiz');
    endBtn.disabled = true;
  });

  // Quiz ended => show download
  socket.on('quiz-ended', () => {
    alert('Quiz ended! You can download CSV now.');
    downloadBtn.classList.remove('d-none');
    // Clear session => quiz is done
    sessionStorage.removeItem('role');
    sessionStorage.removeItem('quizCode');
  });

  // Download CSV => /download-csv/quizCode
  downloadBtn.addEventListener('click', () => {
    window.location.href = `/download-csv/${quizCode}`;
  });

  // Chart updates
  socket.on('answer-counts', (data) => {
    if (data.questionNumber !== currentQuestionNumber) return;
    updateChart(data.counts);
  });

  // ---- Chart.js helpers ----
  function createChart(num) {
    const labels = [];
    for (let i = 0; i < num; i++) {
      labels.push(String.fromCharCode(65 + i));
    }
    chart = new Chart(chartCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ data: Array(num).fill(0) }],
      },
      options: {
        scales: {
          y: { beginAtZero: true, stepSize: 1 },
        },
        plugins: {
          legend: { display: false },
        },
      },
    });
  }
  function resetChart(num) {
    if (!chart) return;
    const labels = [];
    for (let i = 0; i < num; i++) {
      labels.push(String.fromCharCode(65 + i));
    }
    chart.data.labels = labels;
    chart.data.datasets[0].data = Array(num).fill(0);
    chart.update();
  }
  function updateChart(counts) {
    if (!chart) return;
    const labels = chart.data.labels; 
    const arr = labels.map((lbl) => counts[lbl] || 0);
    chart.data.datasets[0].data = arr;
    chart.update();
  }
});

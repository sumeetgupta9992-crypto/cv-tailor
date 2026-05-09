'use client';

import { useState, useRef, useEffect } from 'react';
import { FileText, Download, Loader, CheckCircle, RefreshCw, X, Plus, ChevronRight, AlertCircle, Award } from 'lucide-react';
import { supabase } from '@/app/lib/supabase';

const PRICE_INR = 19;
const SKIP_PAYMENT = typeof process !== 'undefined' && process.env.NODE_ENV === 'development' ? true : false;
const ADMIN_EMAILS = ['p14sumeetg@iima.ac.in', 'sumeetgupta9992@gmail.com'];

function extractEmailFromText(text: string): string | null {
  const m = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}

function extractNameFromText(text: string): string | null {
  const first = text.split('\n').map(l => l.trim()).find(l => l.length > 0) ?? null;
  // Accept as a name only if it's short and looks like words (not an email/URL/code line)
  if (first && first.length <= 60 && /^[a-zA-Z]/.test(first) && !/[@/\\|=]/.test(first)) {
    return first;
  }
  return null;
}
const SESSION_STORAGE_KEY = 'cv-tailor-session';
const SESSION_EXPIRY_HOURS = 24;

type CVData = {
  name: string;
  tagline?: string;
  contact?: {
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
  };
  summary: string;
  skills: string[];
  experience: Array<{ title: string; company: string; duration: string; bullets: string[] }>;
  education: Array<{ degree: string; institution: string; year: string }>;
};

type AppMode = 'mode-selection' | 'existing-cv' | 'interview' | 'analyzing' | 'analysis' | 'payment' | 'generating' | 'success' | 'error';
type AnalysisQuestion = { question: string; options: string[] | null };
type JDRequirement = { requirement: string; match_status: 'strong_match' | 'partial_match' | 'not_found' };

type SessionData = {
  paid: boolean;
  cvContent: string;
  jobDescription: string;
  additionalInfo: string;
  interviewAnswers: string[];
  cvJson: CVData | null;
  refinementCount: number;
  refinementChanges: string[];
  expiryTime: number;
  pendingCvContent: string;
  email: string;
  supabaseRowId: string | null;
};

const INTERVIEW_QUESTIONS = [
  { question: 'What\'s your full name?', required: true },
  { question: 'What\'s your email address?', required: false },
  { question: 'What\'s your phone number?', required: false },
  { question: 'What is your highest education? (e.g., B.Tech Computer Science, IIT Delhi, 2024)', required: true },
  { question: 'Class XII — School name, board, percentage/CGPA', required: false },
  { question: 'Class X — School name, board, percentage/CGPA', required: false },
  { question: 'Do you have any internship or work experience? If yes, describe your most recent one: company name, role, duration, and what you did.', required: false },
  { question: 'List your technical skills (programming languages, tools, frameworks)', required: false },
  { question: 'Any projects you\'ve worked on? Describe one with what you built and the outcome.', required: false },
  { question: 'Any certifications, competitions, awards, or leadership roles?', required: false },
  { question: 'Any volunteering experience with tangible impact?', required: false },
  { question: 'What kind of roles are you targeting? (e.g., Software Engineer, Product Manager, Data Analyst)', required: false },
];

export default function Home() {
  const [appMode, setAppMode] = useState<AppMode>('mode-selection');
  const [errorMsg, setErrorMsg] = useState('');
  const [cvFiles, setCvFiles] = useState<File[]>([]);
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [interviewIndex, setInterviewIndex] = useState(0);
  const [interviewAnswers, setInterviewAnswers] = useState<string[]>(Array(INTERVIEW_QUESTIONS.length).fill(''));
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [cvJson, setCvJson] = useState<CVData | null>(null);
  const [refinementCount, setRefinementCount] = useState(0);
  const [refinementFeedback, setRefinementFeedback] = useState('');
  const [refinementChanges, setRefinementChanges] = useState<string[]>([]);
  const [isPaid, setIsPaid] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [refineSuccess, setRefineSuccess] = useState(false);
  const [isDownloadingWord, setIsDownloadingWord] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [wordDownloadDone, setWordDownloadDone] = useState(false);
  const [pdfDownloadDone, setPdfDownloadDone] = useState(false);
  const [pendingCvContent, setPendingCvContent] = useState('');
  const [pendingMode, setPendingMode] = useState<'existing' | 'scratch' | null>(null);
  const [jdRequirements, setJdRequirements] = useState<JDRequirement[]>([]);
  const [analysisQuestions, setAnalysisQuestions] = useState<AnalysisQuestion[]>([]);
  const [analysisAnswers, setAnalysisAnswers] = useState<string[]>([]);
  const [currentAnalysisAnswer, setCurrentAnalysisAnswer] = useState('');
  const [showHintsModal, setShowHintsModal] = useState(false);
  const [openHintCategory, setOpenHintCategory] = useState<string | null>(null);
  const [copiedHint, setCopiedHint] = useState<string | null>(null);
  const [showTailorAnotherModal, setShowTailorAnotherModal] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [supabaseRowId, setSupabaseRowId] = useState<string | null>(null);
  const [analysisReady, setAnalysisReady] = useState(false);
  const [detectedName, setDetectedName] = useState('');
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [showJdNudge, setShowJdNudge] = useState(false);
  const [showFeedbackCard, setShowFeedbackCard] = useState(false);
  const [feedbackPhase, setFeedbackPhase] = useState<'rating' | 'text' | 'thanks'>('rating');
  const [feedbackRating, setFeedbackRating] = useState<'positive' | 'negative' | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const interviewEndRef = useRef<HTMLDivElement>(null);
  const jdTextareaRef = useRef<HTMLTextAreaElement>(null);
  const refinementTextareaRef = useRef<HTMLTextAreaElement>(null);
  const feedbackAutoSubmitRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const HINT_CATEGORIES = [
    {
      label: 'Academic Achievements (School)',
      bullets: [
        'Secured 95%+ in Class XII (CBSE), ranking in top 5% across 300+ students in science stream',
        'Achieved 10 CGPA in Class X board exams; recognized for consistent academic excellence',
        'Qualified for NTSE Stage 1, ranking among top performers across district-level examination',
      ],
    },
    {
      label: 'Academic Achievements (College)',
      bullets: [
        'Graduated with CGPA 8.5+/10, ranking among top 15% in batch of 300+ students',
        'Secured A grade in core courses including Data Structures, Algorithms, and Operating Systems',
        'Published research paper in college journal, demonstrating structured thinking',
      ],
    },
    {
      label: 'Extracurricular Activities',
      bullets: [
        'Led college fest event with 2000+ participants, managing operations and sponsorships',
        'Won inter-college debate competition among 50+ teams',
        'Organized cultural fest with ₹5L+ budget, coordinating logistics across 20+ vendors',
      ],
    },
    {
      label: 'Internship Experience',
      bullets: [
        'Analyzed user behavior data to identify trends, improving engagement metrics by 15%',
        'Built dashboards using Excel/Power BI to track performance metrics',
        'Developed automation script reducing manual effort by 10 hours/week',
      ],
    },
    {
      label: 'Tech Projects',
      bullets: [
        'Built full-stack web application using React and Node.js',
        'Solved 300+ problems on coding platforms, strengthening DSA skills',
        'Implemented ML model achieving 85% accuracy on classification problem',
      ],
    },
    {
      label: 'Volunteering',
      bullets: [
        'Taught mathematics to 30+ underprivileged students, improving scores by 20%',
        'Organized donation drive raising ₹1L+ for NGO supporting education',
      ],
    },
    {
      label: 'Certifications',
      bullets: [
        'Completed certification in Data Analytics, covering SQL, Python, and visualization',
        'Earned cloud certification demonstrating understanding of scalable infrastructure',
      ],
    },
  ];

  const copyHint = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedHint(text);
    setTimeout(() => setCopiedHint(null), 1500);
  };

  // Ensure the "Tailor Another CV" modal is never open when entering the success screen
  useEffect(() => {
    if (appMode === 'success') setShowTailorAnotherModal(false);
  }, [appMode]);

  // Load Razorpay script and restore session from localStorage
  useEffect(() => {
    // Load Razorpay script
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);

    // Restore session from localStorage (only on client side)
    if (typeof window !== 'undefined') {
      const savedSession = localStorage.getItem(SESSION_STORAGE_KEY);
      if (savedSession) {
        try {
          const session: SessionData = JSON.parse(savedSession);
          if (Date.now() < session.expiryTime && session.paid) {
            // Session is valid
            setIsPaid(true);
            setAdditionalInfo(session.additionalInfo);
            setJobDescription(session.jobDescription);
            setInterviewAnswers(session.interviewAnswers);
            setCvJson(session.cvJson);
            setRefinementCount(session.refinementCount);
            setRefinementChanges(session.refinementChanges);
            setPendingCvContent(session.pendingCvContent || session.cvContent || '');
            if (session.email) setUserEmail(session.email);
            if (session.supabaseRowId) setSupabaseRowId(session.supabaseRowId);
            setAppMode('success');
          } else {
            // Session expired
            localStorage.removeItem(SESSION_STORAGE_KEY);
          }
        } catch (e) {
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      }
    }
  }, []);

  const saveSessionToLocalStorage = (overrides?: Partial<SessionData>) => {
    const session: SessionData = {
      paid: true,
      cvContent: pendingCvContent,
      pendingCvContent,
      jobDescription,
      additionalInfo,
      interviewAnswers,
      cvJson,
      refinementCount,
      refinementChanges,
      email: userEmail,
      supabaseRowId,
      expiryTime: Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000,
      ...overrides,
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  };

  const clearSession = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setIsPaid(false);
    setCvFiles([]);
    setAdditionalInfo('');
    setJobDescription('');
    setInterviewIndex(0);
    setInterviewAnswers(Array(INTERVIEW_QUESTIONS.length).fill(''));
    setCurrentAnswer('');
    setCvJson(null);
    setRefinementCount(0);
    setRefinementFeedback('');
    setRefinementChanges([]);
    setJdRequirements([]);
    setAnalysisQuestions([]);
    setAnalysisAnswers([]);
    setCurrentAnalysisAnswer('');
    setUserEmail('');
    setSupabaseRowId(null);
    setAnalysisReady(false);
    setDetectedName('');
    setShowTailorAnotherModal(false);
    setShowFeedbackCard(false);
    setFeedbackPhase('rating');
    setFeedbackRating(null);
    setFeedbackText('');
    setFeedbackSubmitted(false);
    setAppMode('mode-selection');
  };

  const handlePayment = async () => {
    if (SKIP_PAYMENT) {
      setIsPaid(true);
      await proceedAfterPayment();
      return;
    }

    try {
      // Create order
      const orderRes = await fetch('/api/create-order', { method: 'POST' });
      const orderData = await orderRes.json();

      if (!orderData.success) {
        setErrorMsg(orderData.error || 'Failed to create payment order');
        setAppMode('error');
        return;
      }

      const razorpayKey = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '';
      console.log('[Razorpay] Opening checkout — key:', razorpayKey, '| order_id:', orderData.orderId);

      if (!razorpayKey) {
        setErrorMsg('Razorpay public key is missing. Check NEXT_PUBLIC_RAZORPAY_KEY_ID env var.');
        setAppMode('error');
        return;
      }

      const razorpayWindow = (window as any).Razorpay;
      if (!razorpayWindow) {
        setErrorMsg('Razorpay checkout script failed to load. Please disable any ad blockers and try again.');
        setAppMode('error');
        return;
      }

      // Track whether the success handler fired, so ondismiss can distinguish
      // a manual close from a UPI "pending" close (where neither handler nor
      // payment.failed fires, leaving the user silently stuck on payment screen).
      let paymentHandlerFired = false;

      const options = {
        key: razorpayKey,
        order_id: orderData.orderId,
        amount: 1900, // paise — must match order; here for display only
        currency: 'INR',
        name: 'Portkey',
        description: 'CV generation + 3 refinements',
        handler: async (response: any) => {
          paymentHandlerFired = true;
          try {
            console.log('[Razorpay] ✅ Payment handler fired', {
              payment_id: response.razorpay_payment_id,
              order_id: response.razorpay_order_id,
              signature: response.razorpay_signature ? response.razorpay_signature.slice(0, 16) + '…' : 'MISSING',
            });

            if (!response.razorpay_payment_id || !response.razorpay_order_id || !response.razorpay_signature) {
              console.error('[Razorpay] Incomplete response — missing fields', response);
              setErrorMsg('Payment response incomplete. Please contact support with payment ID: ' + (response.razorpay_payment_id || 'unknown'));
              setAppMode('error');
              return;
            }

            console.log('[Razorpay] Calling /api/verify-payment…');
            const verifyRes = await fetch('/api/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            const verifyData = await verifyRes.json();
            console.log('[Razorpay] Verify response:', { success: verifyData.success, error: verifyData.error });

            if (verifyData.success) {
              console.log('[Razorpay] Verification passed — proceeding to generate');
              setIsPaid(true);
              await proceedAfterPayment();
            } else {
              console.error('[Razorpay] Verification failed:', verifyData.error);
              setErrorMsg(verifyData.error || 'Payment verification failed. Please contact support.');
              setAppMode('error');
            }
          } catch (error) {
            console.error('[Razorpay] Error in payment handler:', error);
            setErrorMsg(error instanceof Error ? error.message : 'Payment handler error');
            setAppMode('error');
          }
        },
        modal: {
          ondismiss: () => {
            console.log('[Razorpay] Modal dismissed — handler had fired:', paymentHandlerFired);
            if (!paymentHandlerFired) {
              // User closed manually OR UPI payment is "pending" (bank confirming).
              // In the pending case neither handler nor payment.failed fires.
              setErrorMsg('Payment was not completed. If you made a UPI payment and were charged, please contact support with your UPI transaction ID.');
              setAppMode('error');
            }
            // If handler already fired we're mid-flow (generating) — don't interfere.
          },
        },
        prefill: {
          email: userEmail.trim() || '',
        },
        theme: { color: '#2B579A' },
        method: {
          upi: true,
          card: false,
          netbanking: false,
          wallet: false,
          emi: false,
        },
        config: {
          display: {
            blocks: {
              upi: {
                name: 'Pay via UPI',
                instruments: [{ method: 'upi' }],
              },
            },
            sequence: ['block.upi'],
            preferences: { show_default_blocks: false },
          },
        },
      };

      const rzp = new razorpayWindow(options);
      rzp.on('payment.failed', (response: any) => {
        console.error('[Razorpay] Payment failed:', response.error);
        setErrorMsg(response.error?.description || response.error?.reason || 'Payment failed');
        setAppMode('error');
      });
      rzp.open();
    } catch (error) {
      console.error('[Razorpay] handlePayment error:', error);
      setErrorMsg(error instanceof Error ? error.message : 'Payment error');
      setAppMode('error');
    }
  };

  // Called immediately after payment. Files are already parsed and stored in pendingCvContent
  // from the analyze step. Analysis answers are already collected. Just generate.
  const proceedAfterPayment = async () => {
    console.log('[proceedAfterPayment] entered', {
      cvLength: pendingCvContent.length,
      questionsCount: analysisQuestions.length,
      answersCount: analysisAnswers.length,
    });

    if (!pendingCvContent.trim()) {
      console.error('[proceedAfterPayment] pendingCvContent is empty — cannot generate');
      setErrorMsg('CV content was lost. Please go back and re-upload your CV.');
      setAppMode('error');
      return;
    }

    const qa = analysisQuestions.map((q, i) => ({ question: q.question, answer: analysisAnswers[i] ?? '' }));
    await generateCV(pendingCvContent, qa);
  };

  const generateCV = async (cvText: string, answers: Array<{ question: string; answer: string }>) => {
    setAppMode('generating');
    setCvJson(null);
    setRefinementCount(0);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cvText,
          jobDescription: jobDescription.trim() || null,
          additionalInfo: additionalInfo.trim() || null,
          answers,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setCvJson(data.cvData);

        // Save to Supabase — non-blocking, errors don't affect the flow
        let rowId: string | null = null;
        try {
          const { data: row, error } = await supabase
            .from('cv_generations')
            .insert({
              email: userEmail.trim() || null,
              job_description: jobDescription.trim().slice(0, 500) || null,
              cv_content: data.cvData,
              refinement_count: 0,
              payment_status: 'pending',
              flow_type: pendingMode === 'scratch' ? 'from_scratch' : 'existing_cv',
              source_cv_text: cvText.slice(0, 1000) || null,
            })
            .select('id')
            .single();
          if (!error && row) rowId = row.id;
        } catch (e) {
          console.error('Supabase insert error:', e);
        }

        setSupabaseRowId(rowId);
        saveSessionToLocalStorage({ cvJson: data.cvData, refinementCount: 0, refinementChanges: [], supabaseRowId: rowId });
        setAppMode('success');
      } else {
        setErrorMsg(data.error || 'Error generating CV');
        setAppMode('error');
      }
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Error generating CV');
      setAppMode('error');
    }
  };

  const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const added = Array.from(e.target.files ?? []);
    setCvFiles((prev) => [...prev, ...added].slice(0, 3));
    e.target.value = '';
  };

  useEffect(() => {
    interviewEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [interviewIndex]);

  const removeFile = (index: number) => {
    setCvFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const runAnalysis = async (cvText: string) => {
    setPendingCvContent(cvText);
    setAnalysisAnswers([]);
    setCurrentAnalysisAnswer('');
    setErrorMsg('');
    setAnalysisReady(false);

    // Extract name + email from CV text and pre-fill if not already set
    const extracted = extractNameFromText(cvText);
    if (extracted) setDetectedName(extracted);
    const extractedEmail = extractEmailFromText(cvText);
    if (extractedEmail) setUserEmail(prev => prev.trim() ? prev : extractedEmail);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cvContent: cvText,
          jobDescription: jobDescription.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setJdRequirements(data.jd_requirements ?? []);
        setAnalysisQuestions(data.questions ?? []);
        // Don't auto-advance — let the user click Continue
        setAnalysisReady(true);
      } else {
        setErrorMsg(data.error || 'Analysis failed');
        setAppMode('error');
      }
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Analysis error');
      setAppMode('error');
    }
  };

  const _proceedExistingCV = async () => {
    setAppMode('analyzing');
    let cvContent = '';
    if (cvFiles.length > 0) {
      const parsed = await Promise.all(
        cvFiles.map(async (file) => {
          const fd = new FormData();
          fd.append('file', file);
          const res = await fetch('/api/parse-pdf', { method: 'POST', body: fd });
          const d = await res.json();
          return d.success ? d.text : '';
        })
      );
      cvContent = parsed.filter(Boolean).join('\n\n---\n\n');
    }
    const fullCvText = [cvContent, additionalInfo.trim()].filter(Boolean).join('\n\n');
    await runAnalysis(fullCvText);
  };

  const _proceedScratchCV = async () => {
    setAppMode('analyzing');
    const cvText = INTERVIEW_QUESTIONS.map((q, i) => `${q.question}\n${interviewAnswers[i] || '(skipped)'}`).join('\n\n');
    await runAnalysis(cvText);
  };

  const handleJdNudgeContinue = async () => {
    setShowJdNudge(false);
    if (pendingMode === 'existing') await _proceedExistingCV();
    else if (pendingMode === 'scratch') await _proceedScratchCV();
  };

  const handleCheckMyFitFromExisting = async () => {
    if (cvFiles.length === 0 && !additionalInfo.trim()) {
      setErrorMsg('Please upload a file or add some information about yourself');
      return;
    }
    setErrorMsg('');
    setPendingMode('existing');
    if (!jobDescription.trim() || jobDescription.trim().length < 50) {
      setShowJdNudge(true);
      return;
    }
    await _proceedExistingCV();
  };

  const handleInterviewAnswer = () => {
    if (!currentAnswer.trim() && INTERVIEW_QUESTIONS[interviewIndex].required) {
      alert('This field is required');
      return;
    }

    const newAnswers = [...interviewAnswers];
    newAnswers[interviewIndex] = currentAnswer;
    setInterviewAnswers(newAnswers);
    setCurrentAnswer('');

    if (interviewIndex < INTERVIEW_QUESTIONS.length - 1) {
      setInterviewIndex(interviewIndex + 1);
    }
  };

  const handleSkipQuestion = () => {
    if (interviewIndex < INTERVIEW_QUESTIONS.length - 1) {
      setInterviewIndex(interviewIndex + 1);
      setCurrentAnswer('');
    }
  };

  const handleCheckMyFitFromScratch = async () => {
    if (!interviewAnswers[0]?.trim()) {
      alert('Name is required');
      return;
    }
    setPendingMode('scratch');
    if (!jobDescription.trim() || jobDescription.trim().length < 50) {
      setShowJdNudge(true);
      return;
    }
    await _proceedScratchCV();
  };

  const isAdminEmail = (email: string) => ADMIN_EMAILS.includes(email.trim().toLowerCase());

  const goToPaymentOrGenerate = () => {
    if (SKIP_PAYMENT || isAdminEmail(userEmail)) {
      proceedAfterPayment();
    } else {
      setAppMode('payment');
    }
  };

  const handleRefineButtonClick = () => {
    if (refinementFeedback.trim()) {
      handleRefine();
    } else {
      refinementTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => refinementTextareaRef.current?.focus(), 400);
    }
  };

  const handleAnalysisAnswer = (answer: string) => {
    const newAnswers = [...analysisAnswers, answer];
    setAnalysisAnswers(newAnswers);
    setCurrentAnalysisAnswer('');
    setShowOtherInput(false);
    if (newAnswers.length >= analysisQuestions.length) {
      goToPaymentOrGenerate();
    }
  };

  const triggerFeedbackCard = () => {
    if (!feedbackSubmitted && !showFeedbackCard) {
      setTimeout(() => setShowFeedbackCard(true), 8000);
    }
  };

  // iOS Safari blocks a.click() in async callbacks (user gesture is gone by then).
  // Android Chrome does not have this restriction — a.click() downloads normally.
  // So only iOS gets the window.open workaround; Android uses the standard path.
  const isIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

  const triggerAnchorDownload = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => window.URL.revokeObjectURL(url), 10000);
  };

  const handleDownloadWord = async () => {
    if (!cvJson || isDownloadingWord) return;
    const safeName = cvJson.name?.replace(/\s+/g, '-') || 'cv';
    // Open blank window synchronously (before any await) so iOS preserves the gesture
    const win = isIos() ? window.open('about:blank', '_blank') : null;
    setIsDownloadingWord(true);
    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvData: cvJson }),
      });
      if (!response.ok) throw new Error('Word download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      if (win) {
        win.location.href = url;
      } else {
        triggerAnchorDownload(url, `${safeName}-tailored.docx`);
      }
      setWordDownloadDone(true);
      setTimeout(() => setWordDownloadDone(false), 3000);
      triggerFeedbackCard();
    } catch (error) {
      win?.close();
      console.error('Word download error:', error);
      alert('Failed to download Word document');
    } finally {
      setIsDownloadingWord(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!cvJson || isDownloadingPdf) return;
    const safeName = cvJson.name?.replace(/\s+/g, '-') || 'cv';
    const win = isIos() ? window.open('about:blank', '_blank') : null;
    setIsDownloadingPdf(true);
    try {
      const response = await fetch('/api/download-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvData: cvJson }),
      });
      if (!response.ok) throw new Error('PDF download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      if (win) {
        win.location.href = url;
      } else {
        triggerAnchorDownload(url, `${safeName}-tailored.pdf`);
      }
      setPdfDownloadDone(true);
      setTimeout(() => setPdfDownloadDone(false), 3000);
      triggerFeedbackCard();
    } catch (error) {
      win?.close();
      console.error('PDF download error:', error);
      alert('Failed to download PDF document');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const submitFeedback = async (rating: 'positive' | 'negative', text: string) => {
    if (feedbackSubmitted) return;
    setFeedbackSubmitted(true);
    setFeedbackPhase('thanks');
    setTimeout(() => setShowFeedbackCard(false), 2500);
    if (supabaseRowId) {
      try {
        const { error } = await supabase
          .from('cv_generations')
          .update({ feedback_rating: rating, feedback_text: text.trim() || null })
          .eq('id', supabaseRowId);
        if (error) console.error('[feedback] Supabase error:', error);
        else console.log('[feedback] ✅ saved rating:', rating, text ? `| text: "${text}"` : '| no text');
      } catch (e) {
        console.error('[feedback] exception:', e);
      }
    }
  };

  const handleFeedbackRating = (rating: 'positive' | 'negative') => {
    setFeedbackRating(rating);
    setFeedbackPhase('text');
    feedbackAutoSubmitRef.current = setTimeout(() => {
      submitFeedback(rating, '');
    }, 5000);
  };

  const handleFeedbackSubmit = () => {
    if (feedbackAutoSubmitRef.current) {
      clearTimeout(feedbackAutoSubmitRef.current);
      feedbackAutoSubmitRef.current = null;
    }
    submitFeedback(feedbackRating!, feedbackText);
  };

  const handleRefine = async () => {
    if (refinementCount >= 3 || !refinementFeedback.trim()) return;
    setIsRefining(true);

    try {
      // Re-parse current files so newly added files are included
      let cvText = pendingCvContent;
      if (cvFiles.length > 0) {
        const parsed = await Promise.all(
          cvFiles.map(async (file) => {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch('/api/parse-pdf', { method: 'POST', body: fd });
            const d = await res.json();
            return d.success ? d.text : '';
          })
        );
        cvText = parsed.filter(Boolean).join('\n\n---\n\n');
        setPendingCvContent(cvText);
      }

      const qa = analysisQuestions.map((q, i) => ({ question: q.question, answer: analysisAnswers[i] ?? '' }));

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cvText,
          jobDescription: jobDescription.trim() || null,
          additionalInfo: additionalInfo.trim() || null,
          answers: qa,
          currentTailoredCV: JSON.stringify(cvJson),
          feedback: refinementFeedback,
        }),
      });

      const data = await response.json();
      if (data.success) {
        const newCount = refinementCount + 1;
        setCvJson(data.cvData);
        setRefinementCount(newCount);
        setRefinementFeedback('');
        setRefinementChanges(data.changes || []);

        // Update Supabase row — non-blocking
        if (supabaseRowId) {
          try {
            console.log('[refine] Updating row', supabaseRowId, '— refinement_count:', newCount);
            const { error } = await supabase
              .from('cv_generations')
              .update({ cv_content: data.cvData, refinement_count: newCount })
              .eq('id', supabaseRowId);
            if (error) console.error('[refine] Supabase update error:', error);
            else console.log('[refine] ✅ refinement_count updated to', newCount);
          } catch (e) {
            console.error('[refine] Supabase exception:', e);
          }
        }

        saveSessionToLocalStorage({ cvJson: data.cvData, refinementCount: newCount, refinementChanges: data.changes || [] });
        setRefineSuccess(true);
        setTimeout(() => setRefineSuccess(false), 3000);
      } else {
        alert(data.error || 'Error refining CV');
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error refining CV');
    } finally {
      setIsRefining(false);
    }
  };

  if (appMode === 'mode-selection') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <main className="max-w-xl mx-auto px-4 py-4 md:py-12 sm:px-6 flex flex-col items-center gap-3 md:gap-6 text-center">

          {/* 1. Quote block — compact on mobile */}
          <div className="w-full rounded-2xl p-3 md:p-5 text-left" style={{ backgroundColor: '#E1F5EE' }}>
            <p className="text-xs md:text-sm leading-relaxed mb-2 md:mb-3 italic" style={{ color: '#1a4a3a' }}>
              &ldquo;My first CV took 3 months. I nagged every senior I knew. Rewrote it 5 times. Still wasn&apos;t sure it was right.&rdquo;
            </p>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 md:w-7 md:h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: '#0F6E56' }}>V</div>
              <span className="text-xs text-slate-600">Vaibhav, Final Year Student</span>
            </div>
          </div>

          {/* 2. Founder line */}
          <p className="text-sm md:text-base font-medium text-slate-700 dark:text-slate-300">
            So I built the tool I wish I had.
          </p>

          {/* 4. H1 */}
          <div>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white leading-tight">
              Every job deserves a different CV.
            </h1>
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold leading-tight mt-1" style={{ color: '#0F6E56' }}>
              Your ATS-ready CV is 5 minutes away.
            </h2>
          </div>

          {/* 5. Steps row — flat, non-interactive; hidden on mobile */}
          <div className="hidden md:flex items-center gap-1 flex-wrap justify-center">
            {(['Upload CV', 'Paste JD', 'Get tailored CV'] as const).map((step, i) => (
              <span key={step} className="flex items-center gap-1">
                <span className="px-3 py-1.5 rounded text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 select-none cursor-default">
                  {step}
                </span>
                {i < 2 && <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: '#0F6E56' }} />}
              </span>
            ))}
          </div>

          {/* 6. Scratch note — prominent teal, visible on all screens */}
          <p className="text-sm font-medium" style={{ color: '#0F6E56' }}>
            ✨ No CV yet? Start from scratch — we&apos;ll guide you.
          </p>

          {/* 7. Price pill */}
          <div className="flex flex-col items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold" style={{ backgroundColor: '#E1F5EE', color: '#0F6E56' }}>
              🚀 Launch offer —
              <span className="line-through font-normal" style={{ color: '#888' }}>₹199</span>
              ₹19 only
            </span>
            <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-bold tracking-wide text-white" style={{ backgroundColor: '#0F6E56' }}>
              90% OFF
            </span>
          </div>

          {/* 3. Alumnus badge — moved here, subtle trust signal */}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border" style={{ backgroundColor: '#E1F5EE', color: '#0F6E56', borderColor: '#0F6E56' }}>
            <Award className="w-3 h-3" />
            By an IIM Ahmedabad alumnus
          </span>

          {/* 8. CTA buttons — compact padding on mobile */}
          <div className="w-full grid grid-cols-2 gap-3 md:gap-4">
            <button
              onClick={() => setAppMode('existing-cv')}
              className="group relative bg-white dark:bg-slate-800 rounded-xl shadow p-4 md:p-6 hover:shadow-lg transition-all text-left border border-slate-200 dark:border-slate-700"
            >
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronRight className="w-4 h-4" style={{ color: '#0F6E56' }} />
              </div>
              <FileText className="w-8 h-8 md:w-10 md:h-10 mb-2 md:mb-3" style={{ color: '#0F6E56' }} />
              <h2 className="text-sm md:text-lg font-bold text-slate-900 dark:text-white mb-0.5">I Have a CV</h2>
              <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400">Tailor it for a role</p>
            </button>

            <button
              onClick={() => { setAppMode('interview'); setInterviewIndex(0); setInterviewAnswers(Array(INTERVIEW_QUESTIONS.length).fill('')); setCurrentAnswer(''); }}
              className="group relative bg-white dark:bg-slate-800 rounded-xl shadow p-4 md:p-6 hover:shadow-lg transition-all text-left border border-slate-200 dark:border-slate-700"
            >
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronRight className="w-4 h-4 text-purple-600" />
              </div>
              <Plus className="w-8 h-8 md:w-10 md:h-10 text-purple-600 mb-2 md:mb-3" />
              <h2 className="text-sm md:text-lg font-bold text-slate-900 dark:text-white mb-0.5">Start from Scratch</h2>
              <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400">Guided step by step</p>
            </button>
          </div>

          {/* 9. Trust row */}
          <div className="flex items-center gap-3 md:gap-4 flex-wrap justify-center pb-4 md:pb-8">
            {['ATS-friendly', 'Word doc download', '3 refinements included'].map((item) => (
              <span key={item} className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#0F6E56' }} />
                {item}
              </span>
            ))}
          </div>

        </main>
      </div>
    );
  }

  if (appMode === 'payment') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl p-8 max-w-md w-full">
          {SKIP_PAYMENT && (
            <div className="mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 dark:text-amber-200">DEV MODE — Payment skipped</p>
            </div>
          )}
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Generate Your CV</h2>
          <p className="text-slate-600 dark:text-slate-300 mb-6">One-time payment for CV generation + 3 refinements included</p>
          
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-slate-700 dark:text-slate-300 font-medium">Total Price</span>
              <div className="flex items-baseline gap-2">
                <span className="text-lg line-through text-slate-400 dark:text-slate-500">₹199</span>
                <span className="text-3xl font-bold text-green-600 dark:text-green-400">₹{PRICE_INR}</span>
              </div>
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-sm text-slate-600 dark:text-slate-400">UPI payment only · Secure checkout by Razorpay</p>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700">
                90% OFF — Launch Offer
              </span>
            </div>
          </div>

          <button
            onClick={handlePayment}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            Pay ₹{PRICE_INR} &amp; Generate
          </button>

          <button
            onClick={() => {
              setPendingCvContent('');
              setPendingMode(null);
              setAppMode('mode-selection');
            }}
            className="w-full mt-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white font-semibold py-2 px-6 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (appMode === 'interview') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        {/* JD nudge popup */}
        {showJdNudge && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowJdNudge(false)}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Add a job description?</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">Your CV will be much more targeted if tailored to a specific role. Paste the job description below — it takes 30 seconds.</p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => { setShowJdNudge(false); setTimeout(() => jdTextareaRef.current?.focus(), 100); }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
                >
                  Add Job Description
                </button>
                <button
                  onClick={handleJdNudgeContinue}
                  className="w-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-semibold py-2.5 px-4 rounded-lg transition-colors text-sm"
                >
                  Continue without JD
                </button>
              </div>
            </div>
          </div>
        )}

        <section className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
          <div className="max-w-2xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <button onClick={() => setAppMode('mode-selection')} className="text-blue-600 hover:text-blue-700 dark:text-blue-400 mb-4 flex items-center gap-1">← Back</button>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Create Your CV</h1>
            <p className="text-slate-600 dark:text-slate-300 mt-2">Question {interviewIndex + 1} of {INTERVIEW_QUESTIONS.length}</p>
          </div>
        </section>

        <main className="max-w-2xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
          <div className="space-y-6">
            <div className="space-y-4">
              {interviewAnswers.map((answer, idx) => (
                answer && (
                  <div key={idx} className="bg-white dark:bg-slate-800 rounded-lg p-4 space-y-2">
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">{INTERVIEW_QUESTIONS[idx].question}</p>
                    <p className="text-slate-900 dark:text-white">{answer}</p>
                  </div>
                )
              ))}
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <p className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{INTERVIEW_QUESTIONS[interviewIndex].question}</p>
              <textarea value={currentAnswer} onChange={(e) => setCurrentAnswer(e.target.value)} placeholder="Type your answer here..." rows={3} className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) { if (interviewIndex === INTERVIEW_QUESTIONS.length - 1) { handleCheckMyFitFromScratch(); } else { handleInterviewAnswer(); } } }} />
              <div className="flex gap-3 mt-4">
                {interviewIndex === INTERVIEW_QUESTIONS.length - 1 ? (
                  <button
                    onClick={handleCheckMyFitFromScratch}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                  >
                    Check my fit
                  </button>
                ) : (
                  <>
                    <button onClick={handleInterviewAnswer} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Next</button>
                    {!INTERVIEW_QUESTIONS[interviewIndex].required && (<button onClick={handleSkipQuestion} className="flex-1 bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-500 text-slate-900 dark:text-white font-semibold py-2 px-4 rounded-lg transition-colors">Skip</button>)}
                  </>
                )}
              </div>
            </div>

            {interviewIndex === INTERVIEW_QUESTIONS.length - 1 && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Got projects or skills not covered above?</p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">Add them in the Additional Information box below before checking your fit — everything there goes straight into your CV.</p>
                </div>
              </div>
            )}

            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Additional Information (Optional)</label>
              <textarea
                value={additionalInfo}
                onChange={(e) => setAdditionalInfo(e.target.value)}
                placeholder="Projects, skills, certifications, awards — anything not covered in the questions above"
                rows={4}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Job Description (Optional)</label>
              <textarea ref={jdTextareaRef} value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="Paste the job description here (optional — if provided, your CV will be tailored to match)" rows={4} className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" />
            </div>

            <div ref={interviewEndRef} />
          </div>
        </main>
      </div>
    );
  }

  if (appMode === 'existing-cv') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        {/* JD nudge popup */}
        {showJdNudge && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowJdNudge(false)}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Add a job description?</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">Your CV will be much more targeted if tailored to a specific role. Paste the job description below — it takes 30 seconds.</p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => { setShowJdNudge(false); setTimeout(() => jdTextareaRef.current?.focus(), 100); }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
                >
                  Add Job Description
                </button>
                <button
                  onClick={handleJdNudgeContinue}
                  className="w-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-semibold py-2.5 px-4 rounded-lg transition-colors text-sm"
                >
                  Continue without JD
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Hints modal */}
        {showHintsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowHintsModal(false)}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Sample bullet points</h3>
                <button onClick={() => setShowHintsModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="px-6 pt-3 pb-1 text-sm text-slate-500 dark:text-slate-400">Copy any bullet that applies to you and paste it into Additional information.</p>
              <div className="overflow-y-auto flex-1 px-6 pb-6 mt-2 space-y-2">
                {HINT_CATEGORIES.map((cat) => (
                  <div key={cat.label} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setOpenHintCategory(openHintCategory === cat.label ? null : cat.label)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{cat.label}</span>
                      <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${openHintCategory === cat.label ? 'rotate-90' : ''}`} />
                    </button>
                    {openHintCategory === cat.label && (
                      <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                        {cat.bullets.map((bullet) => (
                          <li key={bullet} className="flex items-start gap-3 px-4 py-3">
                            <span className="flex-1 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{bullet}</span>
                            <button
                              onClick={() => copyHint(bullet)}
                              className="flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                            >
                              {copiedHint === bullet ? 'Copied!' : 'Copy'}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <section className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
          <div className="max-w-2xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <button onClick={() => setAppMode('mode-selection')} className="text-blue-600 hover:text-blue-700 dark:text-blue-400 mb-4 flex items-center gap-1">← Back</button>
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">Upload your CV</h1>
            <p className="text-lg text-slate-600 dark:text-slate-300">Add your documents and we&apos;ll tailor them to the role</p>
          </div>
        </section>

        <main className="max-w-2xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><FileText className="w-5 h-5" />Your documents</h2>
              {cvFiles.length < 3 && (
                <>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mb-2 flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Choose files
                  </button>
                  <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" multiple onChange={handleFileAdd} className="hidden" />
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">PDF or Word · up to 3 files · CV, cover letter, certificates — anything that helps</p>
                </>
              )}
              {cvFiles.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {cvFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                      <span className="text-sm text-slate-700 dark:text-slate-300">{file.name}</span>
                      <button onClick={() => removeFile(idx)} className="text-red-600 hover:text-red-700"><X className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 dark:text-slate-500 mb-4">No files uploaded yet</p>
              )}
              <div className="relative mb-4">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-300 dark:border-slate-600"></div></div>
                <div className="relative flex justify-center text-sm"><span className="px-2 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400">or</span></div>
              </div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Additional information</label>
              <textarea
                value={additionalInfo}
                onChange={(e) => setAdditionalInfo(e.target.value)}
                placeholder="Add achievements, skills, or experiences not covered in your uploaded documents"
                rows={6}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
              <button
                onClick={() => { setShowHintsModal(true); setOpenHintCategory(null); }}
                className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Need ideas? See examples
              </button>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">Job Description</h2>
              <textarea ref={jdTextareaRef} value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="Paste the job description here (optional — if provided, your CV will be tailored to match)" rows={6} className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" />
            </div>

            <button
              onClick={handleCheckMyFitFromExisting}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Check my fit
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (appMode === 'analyzing') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <div className="w-full max-w-sm px-4 text-center">
          {analysisReady ? (
            <>
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Analysis complete</h2>
              <p className="text-slate-600 dark:text-slate-300 mt-2 mb-8">Ready to show you how you match up</p>
            </>
          ) : (
            <>
              <Loader className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Analysing your profile…</h2>
              <p className="text-slate-600 dark:text-slate-300 mt-2 mb-8">Comparing your background against the role</p>
            </>
          )}

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-5 text-left">
            {detectedName ? (
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Hi {detectedName}, just need your email to continue.
              </p>
            ) : (
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Where should we send updates?
              </label>
            )}
            <input
              type="email"
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
              We&apos;ll use this to save your session. No spam, ever.
            </p>

            {analysisReady && (
              <button
                onClick={() => setAppMode('analysis')}
                className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors text-sm"
              >
                Continue →
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (appMode === 'analysis') {
    const currentQ = analysisQuestions[analysisAnswers.length] ?? null;
    const allAnswered = analysisAnswers.length >= analysisQuestions.length;

    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <section className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
          <div className="max-w-2xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Here&apos;s what the role needs</h1>
          </div>
        </section>

        <main className="max-w-2xl mx-auto px-4 py-10 sm:px-6 lg:px-8 space-y-6">
          {/* JD Requirements */}
          {jdRequirements.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 space-y-3">
              {jdRequirements.map((req, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  {req.match_status === 'strong_match' && (
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  )}
                  {req.match_status === 'partial_match' && (
                    <span className="w-5 h-5 flex-shrink-0 mt-0.5 flex items-center justify-center">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 block" />
                    </span>
                  )}
                  {req.match_status === 'not_found' && (
                    <X className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  )}
                  <span className="text-sm text-slate-700 dark:text-slate-300">{req.requirement}</span>
                </div>
              ))}
            </div>
          )}

          {/* Questions section */}
          {analysisQuestions.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">A few quick questions to strengthen your CV</h2>

              {/* Answered questions (faded) */}
              {analysisAnswers.map((ans, idx) => (
                <div key={idx} className="bg-white dark:bg-slate-800 rounded-lg p-4 space-y-1 opacity-60">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{analysisQuestions[idx].question}</p>
                  <p className="text-sm text-slate-800 dark:text-slate-200">{ans || '(skipped)'}</p>
                </div>
              ))}

              {/* Current question */}
              {currentQ && (
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 cv-fade-in">
                  <p className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{currentQ.question}</p>

                  {currentQ.options ? (
                    <div className="flex flex-col gap-2">
                      {currentQ.options.map((opt: string) => (
                        <button
                          key={opt}
                          onClick={() => handleAnalysisAnswer(opt)}
                          className="text-left px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-slate-800 dark:text-slate-200 transition-colors"
                        >
                          {opt}
                        </button>
                      ))}
                      {!showOtherInput ? (
                        <button
                          onClick={() => setShowOtherInput(true)}
                          className="text-left px-4 py-2.5 rounded-lg border border-dashed border-slate-400 dark:border-slate-500 text-slate-600 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 transition-colors text-sm"
                        >
                          Other…
                        </button>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <input
                            autoFocus
                            type="text"
                            value={currentAnalysisAnswer}
                            onChange={(e) => setCurrentAnalysisAnswer(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAnalysisAnswer(currentAnalysisAnswer); }}
                            placeholder="Type your answer…"
                            className="w-full px-4 py-2 border border-blue-400 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <button
                            onClick={() => handleAnalysisAnswer(currentAnalysisAnswer)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
                          >
                            Submit
                          </button>
                        </div>
                      )}
                      <button
                        onClick={() => handleAnalysisAnswer('')}
                        className="text-left px-4 py-2.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:border-slate-400 transition-colors text-sm"
                      >
                        Skip
                      </button>
                    </div>
                  ) : (
                    <>
                      <textarea
                        value={currentAnalysisAnswer}
                        onChange={(e) => setCurrentAnalysisAnswer(e.target.value)}
                        placeholder="Type your answer…"
                        rows={3}
                        className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                        onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleAnalysisAnswer(currentAnalysisAnswer); }}
                      />
                      <div className="flex gap-3 mt-3">
                        <button
                          onClick={() => handleAnalysisAnswer(currentAnalysisAnswer)}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                        >
                          {analysisAnswers.length < analysisQuestions.length - 1 ? 'Next' : 'Done'}
                        </button>
                        <button
                          onClick={() => handleAnalysisAnswer('')}
                          className="flex-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                        >
                          Skip
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Pay button — shown when no questions, or all answered */}
          {(analysisQuestions.length === 0 || allAnswered) && (
            <div className="cv-fade-in">
              <button
                onClick={goToPaymentOrGenerate}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {isAdminEmail(userEmail) ? 'Generate CV' : `Pay & Generate — ₹${PRICE_INR}`}
              </button>
              {isAdminEmail(userEmail) && (
                <p className="text-center text-xs text-slate-400 mt-1">Admin access</p>
              )}
            </div>
          )}
        </main>
      </div>
    );
  }

  if (appMode === 'generating') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <div className="text-center">
          <Loader className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Generating your CV...</h2>
          <p className="text-slate-600 dark:text-slate-300 mt-2">This may take a moment</p>
        </div>
      </div>
    );
  }

  if (appMode === 'success' && cvJson) {
    const refinesLeft = 3 - refinementCount;

    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        {/* Hints modal (reused from existing-cv screen) */}
        {showHintsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowHintsModal(false)}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Sample bullet points</h3>
                <button onClick={() => setShowHintsModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <p className="px-6 pt-3 pb-1 text-sm text-slate-500 dark:text-slate-400">Copy any bullet that applies to you and paste it into Additional information.</p>
              <div className="overflow-y-auto flex-1 px-6 pb-6 mt-2 space-y-2">
                {HINT_CATEGORIES.map((cat) => (
                  <div key={cat.label} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    <button onClick={() => setOpenHintCategory(openHintCategory === cat.label ? null : cat.label)} className="w-full flex items-center justify-between px-4 py-3 text-left bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{cat.label}</span>
                      <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${openHintCategory === cat.label ? 'rotate-90' : ''}`} />
                    </button>
                    {openHintCategory === cat.label && (
                      <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                        {cat.bullets.map((bullet) => (
                          <li key={bullet} className="flex items-start gap-3 px-4 py-3">
                            <span className="flex-1 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{bullet}</span>
                            <button onClick={() => copyHint(bullet)} className="flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors">
                              {copiedHint === bullet ? 'Copied!' : 'Copy'}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tailor Another CV confirmation modal */}
        {showTailorAnotherModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowTailorAnotherModal(false)}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
              <p className="text-slate-900 dark:text-white text-base mb-6">
                {refinesLeft > 0
                  ? `You still have ${refinesLeft} refinement${refinesLeft === 1 ? '' : 's'} left — you can tweak your current CV at no extra cost. Starting a new CV will require a fresh payment of ₹${PRICE_INR}. Continue anyway?`
                  : `Starting a new CV will require a fresh payment of ₹${PRICE_INR}. Continue?`}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowTailorAnotherModal(false)}
                  className="flex-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
                >
                  Keep refining
                </button>
                <button
                  onClick={clearSession}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
                >
                  Start new CV
                </button>
              </div>
            </div>
          </div>
        )}

        <section className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
          <div className="max-w-2xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">Your CV is ready</h1>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleDownloadWord}
                disabled={isDownloadingWord}
                className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {isDownloadingWord ? (
                  <><Loader className="w-5 h-5 animate-spin" /> Downloading…</>
                ) : wordDownloadDone ? (
                  <><CheckCircle className="w-5 h-5" /> Downloaded!</>
                ) : (
                  <><Download className="w-5 h-5" /> Download Word</>
                )}
              </button>
              <button
                onClick={handleDownloadPdf}
                disabled={isDownloadingPdf}
                className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {isDownloadingPdf ? (
                  <><Loader className="w-5 h-5 animate-spin" /> Downloading…</>
                ) : pdfDownloadDone ? (
                  <><CheckCircle className="w-5 h-5" /> Downloaded!</>
                ) : (
                  <><Download className="w-5 h-5" /> Download PDF</>
                )}
              </button>
            </div>

            {showFeedbackCard && (
              <div className="mt-5 feedback-slide-in">
                <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                  {feedbackPhase === 'rating' && (
                    <>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 text-center">How&apos;s the CV?</p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleFeedbackRating('positive')}
                          className="flex-1 text-3xl py-3 rounded-xl border-2 border-slate-200 dark:border-slate-600 hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all"
                        >
                          👍
                        </button>
                        <button
                          onClick={() => handleFeedbackRating('negative')}
                          className="flex-1 text-3xl py-3 rounded-xl border-2 border-slate-200 dark:border-slate-600 hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                        >
                          👎
                        </button>
                      </div>
                    </>
                  )}

                  {feedbackPhase === 'text' && (
                    <div className="cv-fade-in">
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
                        {feedbackRating === 'positive' ? '👍 Glad to hear it!' : '👎 Sorry it missed the mark.'}
                      </p>
                      <input
                        type="text"
                        autoFocus
                        value={feedbackText}
                        onChange={(e) => {
                          if (feedbackAutoSubmitRef.current) {
                            clearTimeout(feedbackAutoSubmitRef.current);
                            feedbackAutoSubmitRef.current = null;
                          }
                          setFeedbackText(e.target.value);
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleFeedbackSubmit(); }}
                        placeholder="Any quick feedback? (optional)"
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                      />
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={handleFeedbackSubmit}
                          className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
                        >
                          Submit
                        </button>
                        <button
                          onClick={() => submitFeedback(feedbackRating!, '')}
                          className="flex-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 text-sm font-semibold py-2 rounded-lg transition-colors"
                        >
                          Skip
                        </button>
                      </div>
                    </div>
                  )}

                  {feedbackPhase === 'thanks' && (
                    <p className="text-center text-sm text-slate-500 dark:text-slate-400 py-1 cv-fade-in">Thanks for the feedback! 🙏</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Sticky Refine bar — full width, always visible */}
        <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <button
              onClick={handleRefineButtonClick}
              disabled={refinementCount >= 3 || isRefining}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-base"
            >
              {isRefining ? (
                <><Loader className="w-5 h-5 animate-spin" /> Refining…</>
              ) : refineSuccess ? (
                <><CheckCircle className="w-5 h-5" /> CV Updated — download the new version above</>
              ) : refinementCount >= 3 ? (
                'All refinements used'
              ) : (
                <><RefreshCw className="w-5 h-5" /> Refine CV — {refinesLeft} of 3 remaining</>
              )}
            </button>
            {refinementCount < 3 && !isRefining && (
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-1.5">
                {refinementFeedback.trim()
                  ? 'Feedback ready — click Refine above to apply'
                  : 'Add feedback below, upload new documents, or update the job description — then refine'}
              </p>
            )}
          </div>
        </div>

        <main className="max-w-2xl mx-auto px-4 py-10 sm:px-6 lg:px-8 pb-24 md:pb-10 space-y-6">
          {refinementChanges.length > 0 && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-2 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />What changed in this version
              </h3>
              <ul className="space-y-1">
                {refinementChanges.map((change, idx) => (
                  <li key={idx} className="flex gap-2 text-sm text-green-800 dark:text-green-200">
                    <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{change}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-1">What to improve?</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {refinesLeft > 0 ? `${refinesLeft} refinement${refinesLeft === 1 ? '' : 's'} remaining` : 'All refinements used'}
            </p>
            <textarea
              ref={refinementTextareaRef}
              value={refinementFeedback}
              onChange={(e) => setRefinementFeedback(e.target.value)}
              placeholder="Tell us what to change — e.g., emphasize leadership more, shorten the summary, add SQL skills"
              rows={4}
              disabled={refinementCount >= 3}
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1">Update context if needed</p>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><FileText className="w-5 h-5" />Your documents</h2>
            {cvFiles.length < 3 && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mb-2 flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Choose files
                </button>
                <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" multiple onChange={handleFileAdd} className="hidden" />
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">PDF or Word · up to 3 files</p>
              </>
            )}
            {cvFiles.length > 0 ? (
              <div className="space-y-2 mb-4">
                {cvFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                    <span className="text-sm text-slate-700 dark:text-slate-300">{file.name}</span>
                    <button onClick={() => removeFile(idx)} className="text-red-600 hover:text-red-700"><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 dark:text-slate-500 mb-4">No files uploaded yet</p>
            )}
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-300 dark:border-slate-600"></div></div>
              <div className="relative flex justify-center text-sm"><span className="px-2 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400">or add text</span></div>
            </div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Additional information</label>
            <textarea
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value)}
              placeholder="Add achievements, skills, or experiences not covered in your uploaded documents"
              rows={5}
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
            <button onClick={() => { setShowHintsModal(true); setOpenHintCategory(null); }} className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline">
              Need ideas? See examples
            </button>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">Job Description</h2>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the job description here (optional)"
              rows={5}
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
        </main>

        {/* Floating "Tailor Another CV" — desktop: right side, horizontal text */}
        <div className="fixed right-0 top-1/2 -translate-y-1/2 z-30 hidden md:block">
          <button
            onClick={() => setShowTailorAnotherModal(true)}
            className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm font-semibold px-4 py-3 rounded-l-xl shadow-md hover:shadow-lg hover:border-purple-400 dark:hover:border-purple-500 hover:text-purple-600 dark:hover:text-purple-400 transition-all flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Tailor Another CV
          </button>
        </div>

        {/* Mobile: sticky bottom bar */}
        <div className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 px-4 py-3 shadow-lg">
          <button
            onClick={() => setShowTailorAnotherModal(true)}
            className="w-full border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm font-semibold py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Tailor Another CV
          </button>
        </div>
      </div>
    );
  }

  if (appMode === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <div className="text-center max-w-md">
          <X className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Something went wrong</h2>
          <p className="text-slate-600 dark:text-slate-300 mt-2">{errorMsg}</p>
          <button onClick={clearSession} className="mt-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg">Start Over</button>
        </div>
      </div>
    );
  }

  return null;
}

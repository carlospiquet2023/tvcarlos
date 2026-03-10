/**
 * App.tsx — Roteamento Principal da Aplicação
 *
 * Áreas:
 * - /login                    → Tela pública de autenticação
 * - /student/dashboard        → Dashboard do aluno (carrossel de aulas)
 * - /student/lesson/:videoId  → Página individual da aula (vídeo + texto)
 * - /admin                    → Painel administrativo completo
 *
 * Proteção: ProtectedRoute valida JWT e redireciona por role (ADMIN/STUDENT)
 */
// cspell:disable
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ConfigProvider } from './context/ConfigContext';

import Login from './pages/Login';
import StudentDashboard from './pages/StudentDashboard';
import AdminDashboard from './pages/AdminDashboard';
import LessonPage from './pages/LessonPage';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
    <Router>
      <ConfigProvider>
        <AuthProvider>
          <Routes>
            {/* Rota Pública */}
            <Route path="/login" element={<Login />} />

            {/* Rotas Protegidas - Área do Aluno */}
            <Route element={<ProtectedRoute />}>
              <Route path="/student/dashboard" element={<StudentDashboard />} />
              <Route path="/student/lesson/:videoId" element={<LessonPage />} />
              <Route path="/" element={<Navigate to="/student/dashboard" replace />} />
            </Route>

            {/* Rotas Protegidas - Área Institucional / Admin */}
            <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'TEACHER']} />}>
              <Route path="/admin" element={<AdminDashboard />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ConfigProvider>
    </Router>
    </ErrorBoundary>
  );
}

export default App;

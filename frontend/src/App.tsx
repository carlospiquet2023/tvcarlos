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
import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ConfigProvider } from './context/ConfigContext';

import ErrorBoundary from './components/ErrorBoundary';

const Login = lazy(() => import('./pages/Login'));
const StudentDashboard = lazy(() => import('./pages/StudentDashboard'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const LessonPage = lazy(() => import('./pages/LessonPage'));
const VerifyCertificate = lazy(() => import('./pages/VerifyCertificate'));
const CampusLive = lazy(() => import('./pages/CampusLive'));
const TutorPage = lazy(() => import('./pages/TutorPage'));
const PrivateRoomPage = lazy(() => import('./pages/PrivateRoomPage'));
const SchoolManagementPage = lazy(() => import('./pages/SchoolManagementPage'));
const FamilyPortalPage = lazy(() => import('./pages/FamilyPortalPage'));
const ClassWorkspacePage = lazy(() => import('./pages/ClassWorkspacePage'));
const PasswordSetupPage = lazy(() => import('./pages/PasswordSetupPage'));

function App() {
  return (
    <ErrorBoundary>
    <Router>
      <ConfigProvider>
        <AuthProvider>
          <Suspense fallback={<div className="lp-loading"><div className="lp-loading-inner"><span>Carregando...</span></div></div>}>
            <Routes>
              {/* Rota Pública */}
              <Route path="/login" element={<Login />} />
              <Route path="/verify-certificate/:code" element={<VerifyCertificate />} />
              <Route path="/campus/ao-vivo" element={<CampusLive />} />
              <Route path="/sala/:slug" element={<PrivateRoomPage />} />

              {/* Rotas Protegidas - Área do Aluno */}
              <Route element={<ProtectedRoute allowedRoles={['STUDENT']} />}>
                <Route path="/student/dashboard" element={<StudentDashboard />} />
                <Route path="/student/lesson/:videoId" element={<LessonPage />} />
                <Route path="/student/tutor" element={<TutorPage />} />
                <Route path="/" element={<Navigate to="/student/dashboard" replace />} />
              </Route>

              {/* Gate de segurança comum a todos os perfis */}
              <Route element={<ProtectedRoute />}>
                <Route path="/account/security" element={<PasswordSetupPage />} />
              </Route>

              {/* Administração global e de conteúdo */}
              <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'TEACHER']} />}>
                <Route path="/admin" element={<AdminDashboard />} />
              </Route>

              {/* Operação acadêmica da instituição */}
              <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'TEACHER', 'STAFF']} />}>
                <Route path="/school" element={<SchoolManagementPage />} />
                <Route path="/school/organizations/:organizationId/classes/:classId" element={<ClassWorkspacePage />} />
              </Route>

              {/* Acompanhamento do responsável */}
              <Route element={<ProtectedRoute allowedRoles={['GUARDIAN']} />}>
                <Route path="/family" element={<FamilyPortalPage />} />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </ConfigProvider>
    </Router>
    </ErrorBoundary>
  );
}

export default App;

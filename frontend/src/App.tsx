import { AuthProvider } from './auth/AuthContext'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { ChatPage } from './pages/ChatPage'
import { LoginPage } from './pages/LoginPage'
import { SettingsPage } from './pages/SettingsPage'
import { SignupPage } from './pages/SignupPage'
import { Router } from './router/router'

const App = () => {
  return (
    <AuthProvider>
      <Router
        fallback={
          <ProtectedRoute>
            <ChatPage />
          </ProtectedRoute>
        }
        routes={[
          { path: '/login', element: <LoginPage /> },
          { path: '/signup', element: <SignupPage /> },
          {
            path: '/settings',
            element: (
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            ),
          },
          {
            path: '/',
            element: (
              <ProtectedRoute>
                <ChatPage />
              </ProtectedRoute>
            ),
          },
        ]}
      />
    </AuthProvider>
  )
}

export default App

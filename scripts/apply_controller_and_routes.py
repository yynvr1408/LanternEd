from pathlib import Path

# 1. Update NetworkBandwidthController.tsx
nbc_path = Path("frontend/src/components/common/NetworkBandwidthController.tsx")
nbc_code = nbc_path.read_text(encoding="utf-8")

# Improve getEffectivePosition / style calculation
old_style_block = """      <div
        style={
          isExpanded && isMobileScreen
            ? {
                position: 'fixed',
                bottom: '12px',
                left: '12px',
                right: '12px',
                zIndex: 9999,
              }
            : {
                position: 'fixed',
                left: `${position.x}px`,
                top: `${position.y}px`,
                zIndex: 9999,
              }
        }
        className="select-none font-sans transition-all duration-150"
      >"""

new_style_block = """      <div
        style={
          isExpanded && isMobileScreen
            ? {
                position: 'fixed',
                bottom: '12px',
                left: '12px',
                right: '12px',
                maxHeight: 'calc(100dvh - 24px)',
                zIndex: 9999,
              }
            : isExpanded
            ? {
                position: 'fixed',
                left: `${Math.max(12, Math.min(typeof window !== 'undefined' ? window.innerWidth - 396 : 400, position.x))}px`,
                top: `${Math.max(12, Math.min(typeof window !== 'undefined' ? window.innerHeight - 600 : 300, position.y))}px`,
                maxHeight: 'calc(100vh - 24px)',
                zIndex: 9999,
              }
            : {
                position: 'fixed',
                left: `${Math.max(12, Math.min(typeof window !== 'undefined' ? window.innerWidth - 200 : 200, position.x))}px`,
                top: `${Math.max(12, Math.min(typeof window !== 'undefined' ? window.innerHeight - 70 : 100, position.y))}px`,
                zIndex: 9999,
              }
        }
        className="select-none font-sans transition-all duration-150"
      >"""

if old_style_block in nbc_code:
    nbc_code = nbc_code.replace(old_style_block, new_style_block)
    print("Replaced outer style in NetworkBandwidthController.tsx")
else:
    print("Warning: old_style_block not found in NetworkBandwidthController.tsx")

# Add min-h-0 and WebkitOverflowScrolling to the scrollable body
old_scroll_body = """            {/* Scrollable Controller Body */}
            <div
              className="p-3.5 space-y-3 text-xs overflow-y-auto overscroll-contain flex-1"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: '#2DBE8B #121A19',
              }}
            >"""

new_scroll_body = """            {/* Scrollable Controller Body */}
            <div
              className="p-3.5 space-y-3 text-xs overflow-y-auto overscroll-contain flex-1 min-h-0"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: '#2DBE8B #121A19',
                WebkitOverflowScrolling: 'touch',
              }}
            >"""

if old_scroll_body in nbc_code:
    nbc_code = nbc_code.replace(old_scroll_body, new_scroll_body)
    print("Replaced scroll body in NetworkBandwidthController.tsx")
else:
    print("Warning: old_scroll_body not found in NetworkBandwidthController.tsx")

nbc_path.write_text(nbc_code, encoding="utf-8")

# 2. Update AppRoutes.tsx so public routes scroll smoothly if needed
ar_path = Path("frontend/src/routes/AppRoutes.tsx")
ar_code = ar_path.read_text(encoding="utf-8")

# Wrap public authentication routes in a layout route with h-full w-full overflow-y-auto
old_auth_routes = """        {/* Public Authentication Routes */}
        <Route path="/login" element={<LoginChoicePage />} />
        <Route path="/login/student" element={<LoginPage portal="student" />} />
        <Route path="/login/teacher" element={<LoginPage portal="teacher" />} />
        <Route path="/login/college-admin" element={<LoginPage portal="college-admin" />} />
        <Route path="/register" element={<RegisterChoicePage />} />
        <Route path="/register/student" element={<RegisterPage portal="student" />} />
        <Route path="/register/teacher" element={<RegisterPage portal="teacher" />} />
        <Route path="/register/college" element={<CollegeRegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/verify-otp" element={<VerifyOtpPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />"""

new_auth_routes = """        {/* Public Authentication Routes with full scrolling support */}
        <Route element={<div className="h-full w-full overflow-y-auto"><Suspense fallback={<LoadingState />}><Outlet /></Suspense></div>}>
          <Route path="/login" element={<LoginChoicePage />} />
          <Route path="/login/student" element={<LoginPage portal="student" />} />
          <Route path="/login/teacher" element={<LoginPage portal="teacher" />} />
          <Route path="/login/college-admin" element={<LoginPage portal="college-admin" />} />
          <Route path="/register" element={<RegisterChoicePage />} />
          <Route path="/register/student" element={<RegisterPage portal="student" />} />
          <Route path="/register/teacher" element={<RegisterPage portal="teacher" />} />
          <Route path="/register/college" element={<CollegeRegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/verify-otp" element={<VerifyOtpPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Route>"""

# Check if Outlet is imported in AppRoutes.tsx
if "Outlet" not in ar_code:
    ar_code = ar_code.replace("Routes, Route, Navigate", "Routes, Route, Navigate, Outlet")

if old_auth_routes in ar_code:
    ar_code = ar_code.replace(old_auth_routes, new_auth_routes)
    print("Updated public auth routes in AppRoutes.tsx")
else:
    print("Warning: old_auth_routes not found in AppRoutes.tsx")

ar_path.write_text(ar_code, encoding="utf-8")
print("Done updating NetworkBandwidthController and AppRoutes.")

export function AuthMethods() {
  return <div className="auth-methods">
    <div aria-label="Account method"><span aria-current="true">Email</span><button type="button" disabled aria-describedby="mobile-unavailable">Mobile</button></div>
    <p id="mobile-unavailable">Mobile login is not available yet.</p>
  </div>;
}

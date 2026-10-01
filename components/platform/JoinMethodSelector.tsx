import styles from "./JoinTournament.module.css";

/** Presentation choice only; tournament-code joining is not implemented yet. */
export function JoinMethodSelector() {
  return <div className={styles.joinEntry}>
    <h3 className={styles.descriptor}>Join a Tournament</h3>
    <fieldset className={styles.joinMethod}>
    <legend className={styles.srOnly}>Join method</legend>
    <label><input type="radio" name="join-method" value="mid" defaultChecked /><span>MID<span className={styles.srOnly}> (Maroon ID)</span></span></label>
    <label><input type="radio" name="join-method" value="email" /><span>Email &amp; Password</span></label>
    </fieldset>
    <label htmlFor="join-detail" className={styles.srOnly}>Maroon ID or email</label>
    <input id="join-detail" className={styles.joinInput} type="text" placeholder="Enter Maroon ID or email" autoComplete="off" />
  </div>;
}

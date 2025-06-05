import { execFile } from "child_process";

const execFileAsync = (
  file: string,
  args: string[]
) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(file, args, (err, stdout, stderr) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
    });
  });

const execSync = async (command: string, args: string[] = []) => {
  const silent = process.env.DEBUG === "1" ? false : true;
  if (!silent) {
    console.log(`${process.cwd()}$: ${command} ${args.join(" ")}`.trim());
  }
  try {
    const { stdout, stderr } = await execFileAsync(command, args);
    if (!silent && stderr) {
      console.log(stderr);
    }
    if (!silent && stdout) {
      console.log(stdout);
    }
  } catch (err) {
    if (!silent && err) {
      console.log(err);
    }
    throw err;
  }

  return command;
};
export default execSync;

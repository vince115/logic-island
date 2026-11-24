import { describe, expect, it } from 'vitest';
import { CLUSTER_PROFILE, DEPLOY_HOSTS_PROFILE, E32_COMMANDS, PROFILES } from '@/lib/terminal/shell';
import { checkTerminalExercise, describeCheck, machineProblems, machineState, profileOf, terminalContentProblems, variantMachine, type TerminalCheck, type TerminalMachine } from '@/lib/terminal/lesson';
import { parseYaml, parseYamlDocuments } from '@/lib/terminal/yaml';
import { goTab, humanDuration } from '@/lib/terminal/kube-model';
import { session } from './support/environments-fixture';
import { BAD_YAML, kube, kubeLab, kubeOn, WEB_YAML } from './support/kube-fixture';

/*
 * Engine stage E32 (docs/curriculum/KUB0_E32_CLUSTER.md): the cluster profile — kubectl against a simulated kubeadm
 * cluster: the model (nodes, kube-system, the kubeconfig), the scheduler, the kubelet's pod lifecycle over the clock,
 * logs and exec, apply/create/delete/label, selectors and output modes, the checks kube-object and kube-pod, the lesson
 * data, the boundary below the profile, determinism and immutability.
 */
const lines = (...l: string[]) => l;
const exercise = (checks: TerminalCheck[], solution: string[], machine: TerminalMachine = kubeLab) =>
  checkTerminalExercise({ id: 'x', title: 'x', machine: machine.id, statement: '', checks, solution: [], mistakes: [], hints: [], explanation: '' }, [machine], solution);
const content = (checks: TerminalCheck[], machine: TerminalMachine = kubeLab) => terminalContentProblems({ machines: [machine], examples: [], exercises: [
  { id: 'pods', title: 'x', machine: machine.id, statement: 'x', checks, solution: ['kubectl apply -f k8s/web.yaml', 'sleep 5'], mistakes: [{ commands: ['kubectl get pods'], why: 'x' }], hints: [], explanation: 'x' }] });

describe('the cluster profile', () => {
  it('is the deploy-hosts profile with kubectl and the cluster feature', () => {
    expect(E32_COMMANDS).toEqual(['kubectl']);
    expect(CLUSTER_PROFILE.commands.filter(c => !DEPLOY_HOSTS_PROFILE.commands.includes(c))).toEqual(['kubectl']);
    expect(CLUSTER_PROFILE.features).toEqual([...DEPLOY_HOSTS_PROFILE.features!, 'cluster']);
    expect(PROFILES.cluster).toBe(CLUSTER_PROFILE);
    expect(profileOf(kubeLab)).toBe(CLUSTER_PROFILE);
    expect(machineProblems(kubeLab)).toEqual([]);
  });
  it('below it kubectl is not a command and kube is refused; without a cluster kubectl cannot connect', () => {
    const low = { ...kubeLab, profile: 'deploy-hosts' as const };
    expect(machineProblems(low)).toEqual(['machine kub-32: kube needs the cluster profile (engine stage E32)']);
    const plain = { ...low, kube: undefined };
    expect(session(plain, DEPLOY_HOSTS_PROFILE, 'kubectl get pods').last.err[0]).toMatch(/^bash: kubectl: command not found/);
    expect(machineState(plain).kube).toBeUndefined();
    const bare = kubeOn({ ...kubeLab, kube: undefined }, 'kubectl get pods', 'kubectl version --client', 'kubectl version');
    expect(bare.log[0].err).toEqual(['The connection to the server localhost:8080 was refused - did you specify the right host or port?']);
    expect(bare.log[1].out).toEqual(['Client Version: v1.32.3', 'Kustomize Version: v5.5.0']);
    expect(bare.log[2]).toMatchObject({ out: ['Client Version: v1.32.3', 'Kustomize Version: v5.5.0'], status: 1 });
    expect(content([{ kind: 'kube-pod', name: 'web' }], plain)).toContain('exercise pods: a kube-pod check needs a cluster machine (engine stage E32)');
  });
  it('validates the cluster data', () => {
    const bad = { ...kubeLab, kube: { created: '2026-12-01 00:00:00', pullSeconds: 900, namespace: 'Dev', nodes: [{ name: 'cp-01', control: true, taints: ['oops'] }, { name: 'cp-01', cpu: 'lots' }],
      images: [{ name: 'nginx:1.27', nodes: ['node-09'] }], manifests: [{ text: BAD_YAML }] } };
    expect(machineProblems(bad)).toEqual(expect.arrayContaining([
      'machine kub-32: kube: node cp-01: taint oops is not key[=value]:NoSchedule|PreferNoSchedule|NoExecute', 'machine kub-32: kube: node cp-01: a unique lowercase name (RFC 1123 label)',
      'machine kub-32: kube: node cp-01: cpu is a quantity such as 2 or 1500m', 'machine kub-32: kube: created is a UTC time (YYYY-MM-DD HH:MM:SS) not after now', 'machine kub-32: kube: pullSeconds is 0..600',
      'machine kub-32: kube: image nginx:1.27: no node node-09', 'machine kub-32: kube: namespace is a namespace name']));
    expect(machineProblems({ ...kubeLab, kube: { manifests: [{ text: BAD_YAML, file: 'bad.yaml' }] } })).toEqual([
      'machine kub-32: kube: kube.manifests[0]: Error from server (BadRequest): error when creating "bad.yaml": Pod in version "v1" cannot be handled as a Pod: strict decoding error: unknown field "spec.containers[0].imagee"']);
  });
});

describe('the cluster as kubeadm leaves it', () => {
  it('has three nodes, kube-system, the services and the admin kubeconfig', () => {
    const s = kube('kubectl get nodes -o wide', 'kubectl get ns', 'kubectl get svc -A', 'kubectl get deploy,ds -n kube-system', 'ls -l .kube', 'kubectl config get-contexts', 'kubectl cluster-info');
    expect(s.log[0].out).toEqual(lines(
      'NAME      STATUS    ROLES           AGE       VERSION   INTERNAL-IP   EXTERNAL-IP   OS-IMAGE             KERNEL-VERSION     CONTAINER-RUNTIME',
      'cp-01     Ready     control-plane   30d       v1.32.3   10.0.0.50     <none>        Ubuntu 24.04.1 LTS   6.8.0-48-generic   containerd://1.7.24',
      'node-01   Ready     <none>          30d       v1.32.3   10.0.0.51     <none>        Ubuntu 24.04.1 LTS   6.8.0-48-generic   containerd://1.7.24',
      'node-02   Ready     <none>          30d       v1.32.3   10.0.0.52     <none>        Ubuntu 24.04.1 LTS   6.8.0-48-generic   containerd://1.7.24'));
    expect(s.log[1].out.map(l => l.split(/\s+/)[0])).toEqual(['NAME', 'default', 'kube-node-lease', 'kube-public', 'kube-system']);
    expect(s.log[2].out).toEqual(lines(
      'NAMESPACE     NAME         TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)                  AGE',
      'default       kubernetes   ClusterIP   10.96.0.1    <none>        443/TCP                  30d',
      'kube-system   kube-dns     ClusterIP   10.96.0.10   <none>        53/UDP,53/TCP,9153/TCP   30d'));
    expect(s.log[3].out[1]).toMatch(/^deployment\.apps\/coredns\s+2\/2\s+2\s+2\s+30d$/);
    expect(s.log[3].out.at(-1)).toMatch(/^daemonset\.apps\/kube-proxy\s+3\s+3\s+3\s+3\s+3\s+kubernetes\.io\/os=linux\s+30d$/);
    expect(s.log[4].out[0]).toMatch(/^-rw------- learner learner +\d+ config$/);
    expect(s.log[5].out).toEqual(['CURRENT   NAME                          CLUSTER      AUTHINFO           NAMESPACE', '*         kubernetes-admin@kubernetes   kubernetes   kubernetes-admin   ']);
    expect(s.log[6].out[0]).toBe('Kubernetes control plane is running at https://10.0.0.50:6443');
  });
  it('shows the control plane as static pods on cp-01, kube-proxy on every node', () => {
    const out = kube('kubectl get pods -n kube-system -o wide').last.out;
    expect(out.map(l => l.split(/\s+/)[0]).slice(1)).toEqual(['coredns-7hd6wmc4rw-f2mnz', 'coredns-7hd6wmc4rw-jbj7l', 'etcd-cp-01', 'kube-apiserver-cp-01', 'kube-controller-manager-cp-01',
      'kube-proxy-cclcd', 'kube-proxy-f7kh4', 'kube-proxy-q6g8s', 'kube-scheduler-cp-01']);
    expect(out.find(l => l.startsWith('etcd-cp-01'))).toMatch(/1\/1\s+Running\s+0\s+30d\s+10\.0\.0\.50\s+cp-01/);
  });
  it('switches the namespace in the kubeconfig', () => {
    const s = kube('kubectl config set-context --current --namespace=kube-system', 'kubectl get pods -o name', 'kubectl config view --minify -o jsonpath={..namespace}', 'kubectl config use-context nope', 'kubectl config current-context');
    expect(s.log[0].out).toEqual(['Context "kubernetes-admin@kubernetes" modified.']);
    expect(s.log[1].out).toContain('pod/etcd-cp-01');
    expect(s.log[2].out).toEqual(['kube-system']);
    expect(s.log[3]).toMatchObject({ err: ['error: no context exists with the name: "nope"'], status: 1 });
    expect(s.log[4].out).toEqual(['kubernetes-admin@kubernetes']);
    expect(s.state.nodes.get('/home/learner/.kube/config')!.content).toContain('    namespace: kube-system\n');
  });
});

describe('a pod from apply to Running', () => {
  it('is scheduled, pulled (3 s), created and started, with events and the last-applied annotation', () => {
    const s = kube('kubectl apply -f k8s/web.yaml', 'kubectl get pods -o wide', 'sleep 3', 'kubectl get pod web', 'kubectl get events --field-selector metadata.name=x', 'kubectl events --for pod/web', 'kubectl apply -f k8s/web.yaml');
    expect(s.log[0].out).toEqual(['pod/web created']);
    expect(s.log[1].out).toEqual(lines(
      'NAME      READY     STATUS              RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES',
      'hello     1/1       Running             0          2m        10.244.1.2   node-01   <none>           <none>',
      'web       0/1       ContainerCreating   0          0s        10.244.2.2   node-02   <none>           <none>'));
    expect(s.log[3].out[1]).toMatch(/^web\s+1\/1\s+Running\s+0\s+3s$/);
    expect(s.log[5].out).toEqual(lines(
      'LAST SEEN   TYPE      REASON      OBJECT    MESSAGE',
      '3s          Normal    Scheduled   Pod/web   Successfully assigned default/web to node-02',
      '3s          Normal    Pulling     Pod/web   Pulling image "nginx:1.27"',
      '0s          Normal    Pulled      Pod/web   Successfully pulled image "nginx:1.27" in 3s (3s including waiting). Image size: 72099410 bytes.',
      '0s          Normal    Created     Pod/web   Created container: web',
      '0s          Normal    Started     Pod/web   Started container web'));
    expect(s.log[6].out).toEqual(['pod/web unchanged']);
    const y = kube('kubectl apply -f k8s/web.yaml', 'kubectl get pod web -o yaml').last.out;
    expect(y.slice(0, 5)).toEqual(['apiVersion: v1', 'kind: Pod', 'metadata:', '  annotations:', '    kubectl.kubernetes.io/last-applied-configuration: |']);
    expect(y[5]).toBe('      {"apiVersion":"v1","kind":"Pod","metadata":{"annotations":{},"labels":{"app":"web"},"name":"web","namespace":"default"},"spec":{"containers":[{"image":"nginx:1.27","name":"web","ports":[{"containerPort":80}]}]}}');
    expect(y).toEqual(expect.arrayContaining(['  creationTimestamp: "2026-11-24T10:00:00Z"', '    imagePullPolicy: IfNotPresent', '  - containerPort: 80'.replace('  -', '    -'), '  phase: Pending', '  qosClass: BestEffort']));
  });
  it('describes the pod the way kubectl does', () => {
    const d = kube('kubectl apply -f k8s/web.yaml', 'sleep 5', 'kubectl describe pod web').last.out;
    expect(d.slice(0, 12)).toEqual(lines('Name:             web', 'Namespace:        default', 'Priority:         0', 'Service Account:  default', 'Node:             node-02/10.0.0.52',
      'Start Time:       Tue, 24 Nov 2026 10:00:00 +0000', 'Labels:           app=web', 'Annotations:      <none>', 'Status:           Running', 'IP:               10.244.2.2', 'IPs:', '  IP:  10.244.2.2'));
    expect(d).toEqual(expect.arrayContaining(['    State:          Running', '      Started:      Tue, 24 Nov 2026 10:00:03 +0000', '    Ready:          True', '    Restart Count:  0', '  Type                        Status',
      '  PodReadyToStartContainers   True ', 'QoS Class:                   BestEffort', '  Normal  Scheduled  5s    default-scheduler  Successfully assigned default/web to node-02']));
  });
});

describe('the scheduler', () => {
  it('names why no node fits, with the preemption suffix', () => {
    const s = kube('kubectl apply -f k8s/big.yaml', 'kubectl get pod big', 'kubectl get events -o custom-columns=REASON:.reason,MSG:.message --field-selector metadata.name=big');
    expect(s.log[1].out[1]).toMatch(/^big\s+0\/1\s+Pending\s+0\s+0s$/);
    expect(kube('kubectl apply -f k8s/big.yaml', 'kubectl events --types=Warning').last.out[1]).toContain('0/3 nodes are available: 1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: }, 2 Insufficient cpu. preemption: 0/3 nodes are available: 1 Preemption is not helpful for scheduling, 2 No preemption victims found for incoming pod.');
  });
  it('places a nodeSelector pod once a node has the label; taints keep pods off a node', () => {
    const fast = "printf 'apiVersion: v1\\nkind: Pod\\nmetadata:\\n  name: fast\\nspec:\\n  nodeSelector:\\n    disk: ssd\\n  containers:\\n  - name: web\\n    image: nginx:1.27\\n' > fast.yaml";
    const s = kube(fast, 'kubectl apply -f fast.yaml', 'kubectl get pod fast -o wide', 'kubectl label node node-02 disk=ssd', 'kubectl get pod fast -o wide', 'kubectl describe pod fast');
    expect(s.log[2].out[1]).toMatch(/^fast\s+0\/1\s+Pending\s+0\s+0s\s+<none>\s+<none>/);
    expect(s.log[3].out).toEqual(['node/node-02 labeled']);
    expect(s.log[4].out[1]).toMatch(/^fast\s+0\/1\s+ContainerCreating\s+0\s+0s\s+10\.244\.2\.2\s+node-02/);
    expect(s.log[5].out).toEqual(expect.arrayContaining([expect.stringContaining("2 node(s) didn't match Pod's node affinity/selector. preemption: 0/3 nodes are available: 3 Preemption is not helpful for scheduling."), 'Node-Selectors:              disk=ssd']));
    const t = kube('kubectl taint nodes node-01 dedicated=gpu:NoSchedule', 'kubectl taint nodes node-02 dedicated=gpu:NoSchedule', 'kubectl run x --image=busybox:1.36 -- sleep 60', 'kubectl get pod x', 'kubectl taint nodes node-01 dedicated:NoSchedule-', 'kubectl get pod x -o wide');
    expect(t.log[0].out).toEqual(['node/node-01 tainted']);
    expect(t.log[3].out[1]).toMatch(/^x\s+0\/1\s+Pending/);
    expect(t.log[4].out).toEqual(['node/node-01 untainted']);
    expect(t.log[5].out[1]).toMatch(/node-01/);
  });
});

describe('the kubelet over time', () => {
  it('restarts a crashing container with the back-off: CrashLoopBackOff, RESTARTS with its age, logs --previous', () => {
    const s = kube('kubectl run crash --image=team/crash:1.0', 'sleep 7', 'kubectl get pod crash', 'sleep 6', 'kubectl get pod crash', 'sleep 60', 'kubectl get pod crash', 'kubectl logs crash --previous', 'kubectl describe pod crash');
    expect(s.log[2].out[1]).toMatch(/^crash\s+1\/1\s+Running\s+1 \(0s ago\)\s+7s$/);
    expect(s.log[4].out[1]).toMatch(/^crash\s+0\/1\s+CrashLoopBackOff\s+1 \(1s ago\)\s+13s$/);
    // Exits at 7, 12, 27, 52 (5 s runs): restarts at once, then after 10, 20, 40 s back-off.
    expect(s.log[6].out[1]).toMatch(/^crash\s+0\/1\s+CrashLoopBackOff\s+3 \(21s ago\)\s+73s$/);
    expect(s.log[7].out).toEqual(['starting', 'panic: config missing']);
    expect(s.log[8].out).toEqual(expect.arrayContaining(['    State:          Waiting', '      Reason:       CrashLoopBackOff', '    Last State:     Terminated', '      Reason:       Error', '      Exit Code:    1']));
  });
  it('ends jobs as Completed (Never and OnFailure), errors without an environment variable, OOM-kills at the memory limit', () => {
    const oom = "printf 'apiVersion: v1\\nkind: Pod\\nmetadata:\\n  name: oom\\nspec:\\n  containers:\\n  - name: oom\\n    image: team/hungry:1.0\\n    resources:\\n      limits:\\n        memory: 128Mi\\n' > oom.yaml";
    const s = kube('kubectl run job --image=team/job:1.0 --restart=Never', 'kubectl run again --image=team/job:1.0 --restart=OnFailure', 'kubectl run api --image=team/api:1.0 --restart=Never', oom, 'kubectl apply -f oom.yaml', 'sleep 9',
      'kubectl get pods', 'kubectl logs job', 'kubectl logs api', 'kubectl get pod oom -o jsonpath={.status.containerStatuses[0].lastState.terminated.reason}');
    const row = (name: string) => s.log[6].out.find(l => l.startsWith(`${name} `));
    expect(row('job')).toMatch(/0\/1\s+Completed\s+0/);
    expect(row('again')).toMatch(/0\/1\s+Completed\s+0/);
    expect(row('api')).toMatch(/0\/1\s+Error\s+0/);
    expect(row('oom')).toMatch(/1\/1\s+Running\s+1 \(2s ago\)/);
    expect(s.log[7].out).toEqual(['job done']);
    expect(s.log[8].out).toEqual(['Error: DATABASE_URL is not set']);
    expect(s.log[9].out).toEqual(['OOMKilled']);
  });
  it('reports a missing image: ErrImagePull, then ImagePullBackOff and the pull is tried again', () => {
    const s = kube('kubectl run missing --image=nginx:9.99', 'kubectl get pod missing', 'sleep 1', 'kubectl get pod missing', 'sleep 30', 'kubectl events --for pod/missing', 'kubectl logs missing');
    expect(s.log[1].out[1]).toMatch(/ErrImagePull/);
    expect(s.log[3].out[1]).toMatch(/ImagePullBackOff/);
    expect(s.log[5].out).toEqual(expect.arrayContaining([expect.stringMatching(/Warning\s+Failed\s+Pod\/missing\s+Failed to pull image "nginx:9.99": rpc error: code = NotFound desc = failed to pull and unpack image "docker.io\/library\/nginx:9.99": failed to resolve reference "docker.io\/library\/nginx:9.99": docker.io\/library\/nginx:9.99: not found$/),
      expect.stringMatching(/^\d+s \(x3 over 31s\)\s+Normal\s+Pulling/)]));
    expect(s.log[6].err).toEqual(['Error from server (BadRequest): container "missing" in pod "missing" is waiting to start: trying and failing to pull image']);
  });
  it('runs init containers first (Init:0/1), then the app containers', () => {
    // On node-02: busybox pulls in 2 s, the init container sleeps 10 s, then nginx pulls in 3 s.
    const s = kube('kubectl apply -f k8s/init.yaml', 'kubectl get pod boot', 'sleep 8', 'kubectl get pod boot', 'sleep 7', 'kubectl get pod boot', 'kubectl logs boot');
    expect(s.log[1].out[1]).toMatch(/^boot\s+0\/1\s+Init:0\/1/);
    expect(s.log[3].out[1]).toMatch(/^boot\s+0\/1\s+Init:0\/1/);
    expect(s.log[5].out[1]).toMatch(/^boot\s+1\/1\s+Running\s+0\s+15s$/);
    expect(s.log[6].err).toEqual(['Defaulted container "web" out of: web, wait (init)']);
  });
});

describe('logs and exec', () => {
  it('prints a container\'s output and runs commands in it; files written stay in its layer', () => {
    const s = kube('kubectl logs hello', 'kubectl logs hello --tail=1 --timestamps', 'kubectl exec hello -- ls /tmp', 'kubectl exec hello -- touch /tmp/ready', 'kubectl exec hello -- ls /tmp', 'kubectl exec hello -- cat /nope',
      'kubectl exec hello -- hostname', 'kubectl exec -it hello -- sh', 'kubectl exec hello ls', 'kubectl exec hello -- env');
    expect(s.log[0].out).toEqual(['hello from the cluster', 'second line']);
    expect(s.log[1].out).toEqual(['2026-11-24T09:58:02.000000000Z second line']);
    expect(s.log[2].out).toEqual([]);
    expect(s.log[4].out).toEqual(['ready']);
    expect(s.log[5]).toMatchObject({ err: ['cat: /nope: No such file or directory', 'command terminated with exit code 1'], status: 1 });
    expect(s.log[6].out).toEqual(['hello']);
    expect(s.log[7].err[0]).toMatch(/^（模擬環境沒有鍵盤/);
    expect(s.log[8].err).toEqual(['error: exec [POD] [COMMAND] is not supported anymore. Use exec [POD] -- [COMMAND] instead']);
    expect(s.log[9].out.slice(0, 3)).toEqual(['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'HOSTNAME=hello', 'KUBERNETES_SERVICE_HOST=10.96.0.1']);
  });
});

describe('apply, create, delete and labels', () => {
  it('refuses bad manifests in the API server\'s words and names the stage of later kinds', () => {
    const dep = "printf 'apiVersion: apps/v1\\nkind: Deployment\\nmetadata:\\n  name: d\\n' > d.yaml";
    const s = kube('kubectl apply -f k8s/bad.yaml', dep, 'kubectl apply -f d.yaml', 'kubectl apply -f nope.yaml', 'kubectl create -f k8s/web.yaml', 'kubectl create -f k8s/web.yaml', 'kubectl get foo', 'kubectl get rs', 'kubectl rollout status deploy/d');
    expect(s.log[0].err).toEqual(['Error from server (BadRequest): error when creating "k8s/bad.yaml": Pod in version "v1" cannot be handled as a Pod: strict decoding error: unknown field "spec.containers[0].imagee"']);
    expect(s.log[2].err).toEqual(['（模擬環境：Deployment 要到引擎階段 E34 才模擬）']);
    expect(s.log[3].err).toEqual(['error: the path "nope.yaml" does not exist']);
    expect(s.log[5].err).toEqual(['Error from server (AlreadyExists): error when creating "k8s/web.yaml": pods "web" already exists']);
    expect(s.log[6].err).toEqual(['error: the server doesn\'t have a resource type "foo"']);
    expect(s.log[7].err).toEqual(['（模擬環境：rs 要到引擎階段 E34 才模擬）']);
    expect(s.log[8].err).toEqual(['（模擬環境：kubectl rollout 要到引擎階段 E34 才模擬）']);
  });
  it('updates an image in place (the container restarts) and forbids other spec changes', () => {
    const s = kube('kubectl apply -f k8s/web.yaml', 'sleep 5', "sed -i 's/nginx:1.27/busybox:1.36/' k8s/web.yaml", 'kubectl apply -f k8s/web.yaml', "sed -i 's/containerPort: 80/containerPort: 81/' k8s/web.yaml", 'kubectl apply -f k8s/web.yaml', 'kubectl events --for pod/web');
    expect(s.log[3].out).toEqual(['pod/web configured']);
    expect(s.log[5].err[0]).toMatch(/^The Pod "web" is invalid: spec: Forbidden: pod updates may not change fields other than `spec\.containers\[\*\]\.image`/);
    expect(s.log[6].out).toEqual(expect.arrayContaining([expect.stringMatching(/Normal\s+Killing\s+Pod\/web\s+Container web definition changed, will be restarted$/)]));
  });
  it('deletes by name, file, label and namespace; kube-system pods come back; labels need --overwrite', () => {
    const s = kube('kubectl apply -f k8s/two.yaml -f k8s/dev.yaml', 'kubectl delete pods -l tier=back', 'kubectl delete -f k8s/dev.yaml', 'kubectl get pods -A -l app', 'kubectl delete pod a --grace-period=0 --force',
      'kubectl delete ns default', 'kubectl delete pod etcd-cp-01 -n kube-system', 'kubectl get pod etcd-cp-01 -n kube-system', 'kubectl label pod hello tier=front', 'kubectl label pod hello tier=back', 'kubectl label pod hello tier-', 'kubectl delete pods');
    expect(s.log[0].out).toEqual(['pod/a created', 'pod/b created', 'namespace/dev created', 'pod/tool created']);
    expect(s.log[1].out).toEqual(['pod "b" deleted']);
    expect(s.log[2].out).toEqual(['namespace "dev" deleted']);
    expect(s.log[2].err).toEqual(['Error from server (NotFound): error when deleting "k8s/dev.yaml": pods "tool" not found']);
    expect(s.log[3].out.map(l => l.split(/\s+/)[1])).toEqual(['NAME', 'a']);
    expect(s.log[4]).toMatchObject({ out: ['pod "a" force deleted'], err: ['Warning: Immediate deletion does not wait for confirmation that the running resource has been terminated. The resource may continue to run on the cluster indefinitely.'] });
    expect(s.log[5].err).toEqual(['Error from server (Forbidden): namespaces "default" is forbidden: this namespace may not be deleted']);
    expect(s.log[7].out[1]).toMatch(/^etcd-cp-01\s+1\/1\s+Running\s+0\s+0s$/);
    expect(s.log[8].out).toEqual(['pod/hello labeled']);
    expect(s.log[9].err).toEqual(["error: 'tier' already has a value (front), and --overwrite is false"]);
    expect(s.log[10].out).toEqual(['pod/hello unlabeled']);
    expect(s.log[11].err).toEqual(['error: resource(s) were provided, but no name was specified']);
  });
  it('prints kubectl run --dry-run=client -o yaml and reads manifests from standard input', () => {
    const s = kube('kubectl run web --image=nginx:1.27 --port=80 --dry-run=client -o yaml', 'kubectl run web --image=nginx:1.27 --dry-run=client -o yaml | kubectl apply -f -', 'kubectl get pod web -o jsonpath={.metadata.labels.run}');
    expect(s.log[0].out).toEqual(lines('apiVersion: v1', 'kind: Pod', 'metadata:', '  creationTimestamp: null', '  labels:', '    run: web', '  name: web', 'spec:', '  containers:', '  - image: nginx:1.27',
      '    name: web', '    ports:', '    - containerPort: 80', '    resources: {}', '  dnsPolicy: ClusterFirst', '  restartPolicy: Always', 'status: {}'));
    expect(s.log[1].out).toEqual(['pod/web created']);
    expect(s.log[2].out).toEqual(['web']);
  });
});

describe('selectors and output modes', () => {
  it('filters with -l (equality and sets), --field-selector, and prints name, jsonpath, custom-columns, json, -L and --show-labels', () => {
    const s = kube('kubectl apply -f k8s/two.yaml', 'kubectl get pods -l app=shop,tier!=back -o name', "kubectl get pods -l 'tier in (back,front)' -o name", 'kubectl get pods -l "!tier" -o name',
      'kubectl get pods --field-selector spec.nodeName=node-01 -o name', 'kubectl get pods -o jsonpath=\'{range .items[*]}{.metadata.name}{"\\t"}{.spec.nodeName}{"\\n"}{end}\'',
      'kubectl get pods -o custom-columns=NAME:.metadata.name,APP:.metadata.labels.app', 'kubectl get pod a -o json', 'kubectl get pods -L tier --show-labels', 'kubectl get pods -o bogus', 'kubectl get pods -l "a b"');
    expect(s.log[1].out).toEqual(['pod/a']);
    expect(s.log[2].out).toEqual(['pod/b']);
    expect(s.log[3].out).toEqual(['pod/a', 'pod/hello']);
    expect(s.log[4].out).toEqual(['pod/b', 'pod/hello']);
    expect(s.log[5].out).toEqual(['a\tnode-02', 'b\tnode-01', 'hello\tnode-01']);
    expect(s.log[6].out).toEqual(['NAME      APP', 'a         shop', 'b         shop', 'hello     <none>']);
    expect(JSON.parse(s.log[7].out.join('\n'))).toMatchObject({ apiVersion: 'v1', kind: 'Pod', metadata: { name: 'a', labels: { app: 'shop' } } });
    expect(s.log[7].out[1]).toBe('    "apiVersion": "v1",');
    expect(s.log[8].out[0]).toBe('NAME      READY     STATUS              RESTARTS   AGE       TIER      LABELS');
    expect(s.log[9].err[0]).toMatch(/^error: unable to match a printer suitable for the output format "bogus"/);
    expect(s.log[10].err[0]).toMatch(/^error: unable to parse requirement/);
  });
  it('formats ages as apimachinery does and tables as tabwriter does', () => {
    expect([0, 59, 119, 120, 125, 600, 3599, 10800, 7 * 3600 + 120, 30 * 86400, 3 * 365 * 86400].map(humanDuration)).toEqual(['0s', '59s', '119s', '2m', '2m5s', '10m', '59m', '3h', '7h2m', '30d', '3y']);
    expect(goTab(['a\tbb\tc', 'aaaaaaaaaaaa\tb\tc'])).toEqual(['a              bb        c', 'aaaaaaaaaaaa   b         c']);
    expect(goTab(['Name:\tx', 'Longer name:\ty', 'Section:', '  a:\tb'], 0, 2)).toEqual(['Name:         x', 'Longer name:  y', 'Section:', '  a:  b']);
  });
});

describe('multi-document YAML', () => {
  it('reads documents separated by ---, while the single-document parser (Compose) still refuses them', () => {
    const docs = parseYamlDocuments('# first\na: 1\n---\n# only a comment\n---\nb: 2\n');
    expect(docs.map(d => d.t === 'map' ? d.m.map(([k]) => k) : [])).toEqual([['a'], ['b']]);
    expect(docs[1]).toMatchObject({ line: 6 });
    expect(() => parseYaml('a: 1\n---\nb: 2\n')).toThrow('yaml: line 2: 模擬環境的 YAML 子集不支援多個文件（---）');
    expect(() => parseYamlDocuments('a: 1\n---\nb: [\n')).toThrow(/^yaml: line 3:/);
  });
});

describe('the checks kube-object and kube-pod', () => {
  const pod = (c: Partial<Extract<TerminalCheck, { kind: 'kube-pod' }>>): TerminalCheck => ({ kind: 'kube-pod', ...c });
  it('pass on what the commands made and say why not otherwise', () => {
    const checks: TerminalCheck[] = [pod({ name: 'web', status: 'Running', node: 'node-02', ready: true }), { kind: 'kube-object', resource: 'Pod', name: 'web', labels: { app: 'web' }, fields: [{ path: '.spec.containers[0].image', equals: 'nginx:1.27' }] },
      pod({ selector: 'app=web', count: 1 }), pod({ name: 'hello', env: ['HOSTNAME', 'hello'] }), { kind: 'kube-object', resource: 'Namespace', name: 'dev', absent: true }, { kind: 'kube-object', resource: 'Node', name: 'node-02', fields: [{ path: '.status.nodeInfo.kubeletVersion', equals: 'v1.32.3' }] }];
    expect(exercise(checks, ['kubectl apply -f k8s/web.yaml', 'sleep 5']).ok).toBe(true);
    const early = exercise(checks, ['kubectl apply -f k8s/web.yaml']).results;
    expect(early.map(r => r.ok ? null : r.message.split('，但')[1])).toEqual(['web 的狀態是 ContainerCreating', null, null, null, null, null]);
    const none = exercise([pod({ name: 'web' }), { kind: 'kube-object', resource: 'Pod', name: 'web' }, pod({ selector: 'app=web', count: 2 }), pod({ name: 'hello', file: { path: '/tmp/ready' } }), pod({ name: 'hello', restartsAtLeast: 1 })], ['kubectl get pods']).results;
    expect(none.map(r => r.message.split('，但')[1])).toEqual(['沒有名為 web 的 Pod', '沒有名為 web 的 Pod', '符合 app=web 的 Pod 有 0 個', 'hello 的容器裡沒有 /tmp/ready', 'hello 重新啟動了 0 次']);
    expect(exercise([pod({ name: 'hello', file: { path: '/tmp/ready', content: 'ok' } })], ["kubectl exec hello -- sh -c 'echo ok > /tmp/ready'"]).ok).toBe(true);
  });
  it('are described in words and validated', () => {
    expect(describeCheck(pod({ name: 'web', status: 'Running', node: 'node-02' }))).toBe('default 命名空間應該有名為 web 的 Pod（狀態 Running、在 node-02 上）');
    expect(describeCheck({ kind: 'kube-object', resource: 'Namespace', name: 'dev', absent: true })).toBe('叢集應該沒有名為 dev 的 Namespace');
    expect(content([pod({})])).toContain('exercise pods: a kube-pod check names a pod or gives a selector (one of them)');
    expect(content([pod({ name: 'web', count: 1 })])).toContain('exercise pods: a kube-pod check\'s count needs a selector and is a whole number');
    expect(content([{ kind: 'kube-object', resource: 'Gadget', name: 'x' }])).toContain('exercise pods: a kube-object check needs a resource among Pod, Namespace, Node, Service, Deployment, DaemonSet and a name');
    expect(content([pod({ name: 'web', status: 'Running' })])).toEqual([]);
  });
});

describe('variants, determinism and immutability', () => {
  it('a variant replaces the cluster (other nodes), so an answer read from kubectl get cannot be typed in', () => {
    const v = variantMachine(kubeLab, { label: 'four nodes', files: [], kube: { ...kubeLab.kube, nodes: [{ name: 'cp-01', control: true }, { name: 'w1' }, { name: 'w2' }, { name: 'w3' }] } });
    expect(kubeOn(v, 'kubectl get nodes -o name').last.out).toEqual(['node/cp-01', 'node/w1', 'node/w2', 'node/w3']);
    const low = { ...kubeLab, profile: 'deploy-hosts' as const, kube: undefined };
    expect(terminalContentProblems({ machines: [low], examples: [], exercises: [{ id: 'v', title: 'x', machine: 'kub-32', statement: 'x', checks: [{ kind: 'cwd', path: '/home/learner' }], solution: ['pwd'],
      mistakes: [{ commands: ['cd /'], why: 'x' }], hints: [], explanation: 'x', variants: [{ label: 'k', files: [], kube: {} }] }] })).toContain('exercise v: variant k: kube needs the cluster profile (engine stage E32)');
  });
  it('replays identically and never changes the state it starts from', () => {
    const cmds = ['kubectl apply -f k8s/two.yaml', 'kubectl run crash --image=team/crash:1.0', 'sleep 40', 'kubectl get pods -o wide', 'kubectl describe pod crash', 'kubectl get events -A'];
    const start = machineState(kubeLab), before = JSON.stringify(start.kube);
    const a = session(start, CLUSTER_PROFILE, ...cmds), b = kube(...cmds);
    expect(a.log).toEqual(b.log);
    expect(JSON.stringify(start.kube)).toBe(before);
    expect(machineState(kubeLab).nodes.get('/home/learner/k8s/web.yaml')!.content).toBe(WEB_YAML);
  });
});

import { config } from './config.js';

// Oracle Cloud Always Free Tier:
// [인프라]
// - ARM Ampere A1: 매월 OCPU 3,000시간 + 18,000GB-시간 (VM 1~4개, 최대 4 OCPU/24GB)
// - AMD VM 2개 (각각 OCPU 1/8, 1GB RAM)
// - 블록 볼륨 스토리지 2개, 총 200GB
// - 오브젝트 스토리지 10GB(표준) + 10GB(비정규) + 10GB 아카이브
// - 관리형 Terraform, 5개 OCI Bastions
// [데이터베이스]
// - Autonomous DB 2개 (각 OCPU 1개 + 20GB) - ATP/ADW/JSON/APEX 중 선택
// - NoSQL: 1.33억 읽기/쓰기, 3개 테이블, 각 25GB
// [네트워크]
// - 로드밸런서 1개 (10Mbps) + Flexible NLB
// - 아웃바운드 매월 10TB, VCN 2개, VPN IPSec 50개
// [추가]
// - 모니터링: 5억 수집 + 10억 검색 데이터포인트
// - 로깅: 매월 10GB
// - 이메일 딜리버리: 매월 3,000건
// - 인증서: 5개 CA + 150개 TLS
// - Content Management: 5,000개 에셋

interface OracleConfig {
  tenancyOcid: string;
  userOcid: string;
  fingerprint: string;
  privateKeyPath: string;
  region: string;
  compartmentOcid: string;
}

function getOracleConfig(): OracleConfig {
  const oci = config.get('oracle') as OracleConfig | undefined;
  if (!oci?.tenancyOcid) throw new Error('Oracle Cloud not configured. Run: freestack init');
  return oci;
}

// OCI uses request signing - we'll shell out to OCI CLI for simplicity
import { execSync } from 'child_process';

function ociCmd(args: string): string {
  try {
    return execSync(`oci ${args} --output json`, { encoding: 'utf-8' });
  } catch (e: any) {
    throw new Error(`OCI CLI error: ${e.stderr || e.message}`);
  }
}

export function checkOciCli(): boolean {
  try {
    execSync('which oci', { encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

export function listInstances() {
  const oci = getOracleConfig();
  const result = ociCmd(`compute instance list --compartment-id ${oci.compartmentOcid}`);
  return JSON.parse(result).data || [];
}

export function listAvailabilityDomains() {
  const oci = getOracleConfig();
  const result = ociCmd(`iam availability-domain list --compartment-id ${oci.tenancyOcid}`);
  return JSON.parse(result).data || [];
}

export function getAlwaysFreeShapes() {
  const oci = getOracleConfig();
  const result = ociCmd(`compute shape list --compartment-id ${oci.compartmentOcid}`);
  const shapes = JSON.parse(result).data || [];
  return shapes.filter((s: any) =>
    s['shape'] === 'VM.Standard.A1.Flex' ||  // ARM - 4 OCPU, 24GB free
    s['shape'] === 'VM.Standard.E2.1.Micro'  // AMD - 1/8 OCPU, 1GB free
  );
}

export function launchInstance(opts: {
  displayName: string;
  shape: 'VM.Standard.A1.Flex' | 'VM.Standard.E2.1.Micro';
  ocpus?: number;
  memoryInGBs?: number;
  imageId: string;
  subnetId: string;
  availabilityDomain: string;
  sshPublicKeyPath: string;
}) {
  const oci = getOracleConfig();

  const shapeConfig = opts.shape === 'VM.Standard.A1.Flex'
    ? `--shape-config '{"ocpus": ${opts.ocpus || 4}, "memoryInGBs": ${opts.memoryInGBs || 24}}'`
    : '';

  const sshKey = execSync(`cat ${opts.sshPublicKeyPath}`, { encoding: 'utf-8' }).trim();

  const result = ociCmd(
    `compute instance launch ` +
    `--compartment-id ${oci.compartmentOcid} ` +
    `--availability-domain "${opts.availabilityDomain}" ` +
    `--display-name "${opts.displayName}" ` +
    `--shape "${opts.shape}" ` +
    `${shapeConfig} ` +
    `--image-id "${opts.imageId}" ` +
    `--subnet-id "${opts.subnetId}" ` +
    `--assign-public-ip true ` +
    `--metadata '{"ssh_authorized_keys": "${sshKey}"}'`
  );
  return JSON.parse(result).data;
}

export function listImages(compartmentId?: string) {
  const oci = getOracleConfig();
  const cid = compartmentId || oci.compartmentOcid;
  const result = ociCmd(
    `compute image list --compartment-id ${cid} ` +
    `--operating-system "Canonical Ubuntu" --lifecycle-state AVAILABLE --limit 5 --sort-by TIMECREATED`
  );
  return JSON.parse(result).data || [];
}

export function listVcns() {
  const oci = getOracleConfig();
  const result = ociCmd(`network vcn list --compartment-id ${oci.compartmentOcid}`);
  return JSON.parse(result).data || [];
}

export function listSubnets(vcnId: string) {
  const oci = getOracleConfig();
  const result = ociCmd(`network subnet list --compartment-id ${oci.compartmentOcid} --vcn-id ${vcnId}`);
  return JSON.parse(result).data || [];
}

export function getInstancePublicIp(instanceId: string) {
  const result = ociCmd(`compute instance list-vnics --instance-id ${instanceId}`);
  const vnics = JSON.parse(result).data || [];
  return vnics[0]?.['public-ip'] || null;
}

export const FREE_TIER_INFO = {
  compute: {
    arm: {
      shape: 'VM.Standard.A1.Flex',
      maxOcpus: 4,
      maxMemoryGB: 24,
      monthlyOcpuHours: 3000,
      monthlyMemoryGBHours: 18000,
      description: 'ARM Ampere A1 (최대 4 OCPU, 24GB RAM, VM 1~4개)',
    },
    amd: {
      shape: 'VM.Standard.E2.1.Micro',
      count: 2,
      ocpus: 0.125,
      memoryGB: 1,
      description: 'AMD Micro x2 (각 1/8 OCPU, 1GB RAM)',
    },
  },
  storage: {
    block: '200GB (볼륨 2개)',
    objectStandard: '10GB',
    objectInfrequent: '10GB',
    archive: '10GB',
  },
  database: {
    autonomous: '2개 DB (각 OCPU 1개 + 20GB) - ATP/ADW/JSON/APEX',
    nosql: '1.33억 읽기/쓰기, 3개 테이블, 각 25GB',
  },
  network: {
    outbound: '10TB/월',
    loadBalancer: '1개 (10Mbps)',
    flexibleNLB: '1개',
    vcn: '최대 2개',
    vpn: 'IPSec 50개',
  },
  extras: {
    emailDelivery: '3,000건/월',
    monitoring: '5억 수집 + 10억 검색 데이터포인트',
    logging: '10GB/월',
    certificates: '5개 CA + 150개 TLS',
    contentMgmt: '5,000개 에셋/월',
    bastions: '5개',
    terraform: '관리형 Terraform',
  },
};

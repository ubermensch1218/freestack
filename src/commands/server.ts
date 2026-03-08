import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { checkOciCli, listInstances, getInstancePublicIp, FREE_TIER_INFO, OCI_REGIONS, checkRegionCapacity, checkAllRegionsCapacity } from '../services/oracle.js';
import * as ui from '../utils/ui.js';

export const serverCommand = new Command('server')
  .description('Oracle Cloud 서버 인스턴스 관리');

serverCommand
  .command('list')
  .description('인스턴스 목록')
  .action(async () => {
    if (!checkOciCli()) {
      ui.error('OCI CLI가 설치되어 있지 않습니다.');
      ui.info('brew install oci-cli');
      return;
    }

    const spinner = ora('인스턴스 조회 중...').start();
    try {
      const instances = listInstances();
      spinner.stop();

      if (!instances.length) {
        ui.info('실행 중인 인스턴스가 없습니다.');
        ui.info('생성: freestack server create');
        return;
      }

      ui.heading(`Oracle Cloud 인스턴스 (${instances.length}개)`);
      ui.table(
        ['이름', 'Shape', '상태', 'Public IP', 'OCID (short)'],
        instances.map((i: any) => {
          let ip = '-';
          try { ip = getInstancePublicIp(i.id) || '-'; } catch {}
          return [
            i['display-name'],
            i.shape,
            statusColor(i['lifecycle-state']),
            ip,
            i.id?.split('.').pop()?.substring(0, 12) || '-',
          ];
        }),
      );
    } catch (e: any) {
      spinner.fail(e.message);
    }
  });

serverCommand
  .command('info')
  .description('Oracle Cloud 무료 티어 정보')
  .action(() => {
    ui.heading('Oracle Cloud Always Free Tier');
    console.log();

    ui.heading('컴퓨트');
    ui.table(
      ['타입', 'Shape', '사양', '참고'],
      [
        ['ARM', FREE_TIER_INFO.compute.arm.shape, '최대 4 OCPU, 24GB RAM', 'VM 1~4개로 분할 가능'],
        ['AMD', FREE_TIER_INFO.compute.amd.shape, '1/8 OCPU, 1GB RAM', '2대 제공'],
      ],
    );

    ui.heading('스토리지');
    ui.table(
      ['타입', '용량'],
      [
        ['블록 볼륨', FREE_TIER_INFO.storage.block],
        ['오브젝트 (표준)', FREE_TIER_INFO.storage.objectStandard],
        ['오브젝트 (비정규)', FREE_TIER_INFO.storage.objectInfrequent],
        ['아카이브', FREE_TIER_INFO.storage.archive],
      ],
    );

    ui.heading('데이터베이스');
    ui.table(
      ['서비스', '무료 할당'],
      [
        ['Autonomous DB', FREE_TIER_INFO.database.autonomous],
        ['NoSQL', FREE_TIER_INFO.database.nosql],
      ],
    );

    ui.heading('네트워크');
    ui.table(
      ['서비스', '무료 할당'],
      [
        ['아웃바운드', FREE_TIER_INFO.network.outbound],
        ['로드밸런서', FREE_TIER_INFO.network.loadBalancer],
        ['Flexible NLB', FREE_TIER_INFO.network.flexibleNLB],
        ['VCN', FREE_TIER_INFO.network.vcn],
        ['VPN (IPSec)', FREE_TIER_INFO.network.vpn],
      ],
    );

    ui.heading('추가 서비스');
    ui.table(
      ['서비스', '무료 할당'],
      [
        ['이메일 딜리버리', FREE_TIER_INFO.extras.emailDelivery],
        ['모니터링', FREE_TIER_INFO.extras.monitoring],
        ['로깅', FREE_TIER_INFO.extras.logging],
        ['인증서', FREE_TIER_INFO.extras.certificates],
        ['Bastions', FREE_TIER_INFO.extras.bastions],
        ['Terraform', FREE_TIER_INFO.extras.terraform],
        ['Content Mgmt', FREE_TIER_INFO.extras.contentMgmt],
      ],
    );
  });

serverCommand
  .command('capacity')
  .description('전 세계 리전별 무료 VM 가용 여부 조회')
  .option('-r, --region <region>', '특정 리전만 조회')
  .action(async (opts) => {
    if (!checkOciCli()) {
      ui.error('OCI CLI가 설치되어 있지 않습니다.');
      return;
    }

    if (opts.region) {
      const spinner = ora(`${opts.region} 조회 중...`).start();
      const cap = await checkRegionCapacity(opts.region);
      spinner.stop();
      const r = OCI_REGIONS.find(r => r.key === opts.region);
      ui.heading(`${r?.name || opts.region} 가용 여부`);
      ui.table(
        ['Shape', '사양', '상태'],
        [
          ['ARM A1 Flex', '4 OCPU / 24GB RAM', capColor(cap.arm)],
          ['AMD Micro', '1/8 OCPU / 1GB RAM', capColor(cap.amd)],
        ],
      );
      return;
    }

    const spinner = ora('전 세계 16개 리전 스캔 중... (약 30초)').start();
    const results = await checkAllRegionsCapacity((done, total) => {
      spinner.text = `리전 스캔 중... ${done}/${total}`;
    });
    spinner.stop();

    ui.heading('Oracle Cloud Free Tier — 리전별 가용 여부');
    console.log(chalk.gray('  ✅ = 가용  ❌ = 품절  ⚠️  = 조회 실패\n'));

    const available = results.filter(r => r.arm === 'AVAILABLE' || r.amd === 'AVAILABLE');
    const unavailable = results.filter(r => r.arm !== 'AVAILABLE' && r.amd !== 'AVAILABLE');

    if (available.length) {
      ui.heading('🟢 자리 있는 리전');
      ui.table(
        ['리전', '위치', 'ARM (24GB)', 'AMD Micro (1GB)'],
        available.map(r => [r.region, r.regionName, capIcon(r.arm), capIcon(r.amd)]),
      );
    }

    if (unavailable.length) {
      console.log();
      ui.heading('🔴 품절 리전');
      ui.table(
        ['리전', '위치', 'ARM (24GB)', 'AMD Micro (1GB)'],
        unavailable.map(r => [r.region, r.regionName, capIcon(r.arm), capIcon(r.amd)]),
      );
    }

    console.log();
    ui.info('💡 Free Tier는 홈 리전에서만 무료. 가입 시 자리 있는 리전을 선택하세요.');
    if (available.some(r => r.arm === 'AVAILABLE')) {
      ui.success('ARM A1 Flex가 가용한 리전이 있습니다! 가입 시 해당 리전을 홈으로 선택하면 24GB 서버 무료.');
    }
  });

function capColor(status: string): string {
  if (status === 'AVAILABLE') return chalk.green('✅ 가용');
  if (status === 'OUT_OF_HOST_CAPACITY') return chalk.red('❌ 품절');
  return chalk.yellow('⚠️  조회 실패');
}

function capIcon(status: string): string {
  if (status === 'AVAILABLE') return chalk.green('✅');
  if (status === 'OUT_OF_HOST_CAPACITY') return chalk.red('❌');
  return chalk.yellow('⚠️');
}

function statusColor(state: string): string {
  switch (state) {
    case 'RUNNING': return chalk.green(state);
    case 'STOPPED': return chalk.yellow(state);
    case 'TERMINATED': return chalk.red(state);
    case 'PROVISIONING': return chalk.cyan(state);
    default: return state;
  }
}
